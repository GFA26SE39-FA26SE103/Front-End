import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ZoneRecord } from '../api/floors';
import { clampNormalized, clientToNormalized, normalizeRotation, type NormalizedPosition } from './floorPlanGeometry';
import { ZoneEditorOverlay, type ZoneEditorSave } from './ZoneEditorOverlay';
import s from './FloorPlanSurface.module.css';

export type CameraPlacement = {
  cameraId: string;
  code: string;
  mapX: number | null;
  mapY: number | null;
  mapRotationDeg: number | null;
  status: string;
};

export type PlacementChange = NormalizedPosition & { rotationDeg: number };

export type FloorPlanSurfaceProps = {
  mapUrl: string;
  mapContentType: string;
  cameras: CameraPlacement[];
  selectedCameraId: string | null;
  dirtyCameraIds?: ReadonlySet<string>;
  onSelectCamera: (cameraId: string) => void;
  onChangePlacement: (cameraId: string, placement: PlacementChange) => void;
  zoneEditor?: {
    zones: ZoneRecord[];
    saving: boolean;
    onSave: (zone: ZoneEditorSave) => Promise<void> | void;
    onCancel: () => void;
  };
};

const cameraPosition = (camera: CameraPlacement): NormalizedPosition => ({
  x: camera.mapX ?? 0.5,
  y: camera.mapY ?? 0.5,
});

const cameraRotation = (camera: CameraPlacement) => normalizeRotation(camera.mapRotationDeg ?? 0);

export function FloorPlanSurface({
  mapUrl,
  mapContentType,
  cameras,
  selectedCameraId,
  dirtyCameraIds = new Set<string>(),
  onSelectCamera,
  onChangePlacement,
  zoneEditor,
}: FloorPlanSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragPointer = useRef<number | null>(null);
  const rotationPointer = useRef<number | null>(null);

  const moveCamera = (camera: CameraPlacement, clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const position = clientToNormalized(surface.getBoundingClientRect(), clientX, clientY);
    onChangePlacement(camera.cameraId, { ...position, rotationDeg: cameraRotation(camera) });
  };

  const rotateCamera = (camera: CameraPlacement, clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const position = cameraPosition(camera);
    const centerX = rect.left + position.x * rect.width;
    const centerY = rect.top + position.y * rect.height;
    const rotationDeg = normalizeRotation(Math.atan2(clientY - centerY, clientX - centerX) * 180 / Math.PI);
    onChangePlacement(camera.cameraId, { ...position, rotationDeg });
  };

  const onCameraKeyDown = (event: KeyboardEvent<HTMLButtonElement>, camera: CameraPlacement) => {
    const increments: Record<string, NormalizedPosition> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = increments[event.key];
    if (!direction) return;
    event.preventDefault();
    onSelectCamera(camera.cameraId);
    const step = event.shiftKey ? 0.05 : 0.01;
    const current = cameraPosition(camera);
    const position = clampNormalized({ x: current.x + direction.x * step, y: current.y + direction.y * step });
    onChangePlacement(camera.cameraId, { ...position, rotationDeg: cameraRotation(camera) });
  };

  const onRotationKeyDown = (event: KeyboardEvent<HTMLButtonElement>, camera: CameraPlacement) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.shiftKey ? 15 : 5;
    const delta = event.key === 'ArrowLeft' ? -step : step;
    onChangePlacement(camera.cameraId, {
      ...cameraPosition(camera),
      rotationDeg: normalizeRotation(cameraRotation(camera) + delta),
    });
  };

  return (
    <div className={s.viewport}>
      <div ref={surfaceRef} className={s.surface} data-testid="floor-plan-surface">
        {mapContentType === 'application/pdf'
          ? <PdfPage url={mapUrl} />
          : <img className={s.map} src={mapUrl} alt="Uploaded floor plan" draggable={false} />}
        <div className={s.overlay}>
          {cameras.map((camera) => {
            const position = cameraPosition(camera);
            const rotation = cameraRotation(camera);
            const selected = camera.cameraId === selectedCameraId;
            const dirty = dirtyCameraIds.has(camera.cameraId);
            return (
              <div
                key={camera.cameraId}
                className={`${s.cameraGroup} ${selected ? s.selected : ''}`}
                style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
              >
                <span className={s.fov} data-testid="camera-fov" aria-hidden="true" />
                <button
                  type="button"
                  className={s.camera}
                  disabled={Boolean(zoneEditor)}
                  aria-label={`Place ${camera.code} at ${Math.round(position.x * 100)}%, ${Math.round(position.y * 100)}%`}
                  aria-pressed={selected}
                  onClick={() => onSelectCamera(camera.cameraId)}
                  onKeyDown={(event) => onCameraKeyDown(event, camera)}
                  onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    onSelectCamera(camera.cameraId);
                    dragPointer.current = event.pointerId;
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                  }}
                  onPointerMove={(event: PointerEvent<HTMLButtonElement>) => {
                    if (dragPointer.current !== event.pointerId) return;
                    moveCamera(camera, event.clientX, event.clientY);
                  }}
                  onPointerUp={(event) => {
                    if (dragPointer.current === event.pointerId) dragPointer.current = null;
                    event.currentTarget.releasePointerCapture?.(event.pointerId);
                  }}
                  onPointerCancel={() => { dragPointer.current = null; }}
                >
                  <span className={s.cameraBody} aria-hidden="true" />
                  <span className={s.muzzle} data-testid="camera-muzzle" aria-hidden="true" />
                </button>
                {selected && (
                  <button
                    type="button"
                    className={s.rotationHandle}
                    disabled={Boolean(zoneEditor)}
                    aria-label={`Rotate ${camera.code}`}
                    onKeyDown={(event) => onRotationKeyDown(event, camera)}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      rotationPointer.current = event.pointerId;
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (rotationPointer.current !== event.pointerId) return;
                      rotateCamera(camera, event.clientX, event.clientY);
                    }}
                    onPointerUp={(event) => {
                      if (rotationPointer.current === event.pointerId) rotationPointer.current = null;
                      event.currentTarget.releasePointerCapture?.(event.pointerId);
                    }}
                    onPointerCancel={() => { rotationPointer.current = null; }}
                  />
                )}
                <span className={s.label} style={{ transform: `translateX(-50%) rotate(${-rotation}deg)` }}>
                  {camera.code}{dirty && <strong>Unsaved</strong>}
                </span>
              </div>
            );
          })}
        </div>
        {zoneEditor && <ZoneEditorOverlay {...zoneEditor} />}
      </div>
    </div>
  );
}

export function PdfPage({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | undefined;
    let documentTask: { destroy: () => Promise<void>; promise: Promise<{ getPage: (page: number) => Promise<{ getViewport: (options: { scale: number }) => { width: number; height: number }; render: (options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: unknown }) => typeof renderTask }> }> } | undefined;
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        documentTask = pdfjs.getDocument({ url }) as unknown as typeof documentTask;
        const document = await documentTask!.promise;
        const page = await document.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        if (disposed || !canvas) return;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas rendering is unavailable.');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = page.render({ canvas, canvasContext: context, viewport }) as typeof renderTask;
        await renderTask!.promise;
      } catch (reason) {
        if (!disposed && (reason as { name?: string }).name !== 'RenderingCancelledException') setError(true);
      }
    })();
    return () => {
      disposed = true;
      renderTask?.cancel();
      void documentTask?.destroy();
    };
  }, [url]);

  return error
    ? <div className={s.pdfError} role="alert">The PDF floor plan could not be rendered.</div>
    : <canvas ref={canvasRef} className={s.map} aria-label="Uploaded floor plan" role="img" />;
}
