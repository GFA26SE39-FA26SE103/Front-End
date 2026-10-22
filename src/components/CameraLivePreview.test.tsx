import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraLivePreview } from './CameraLivePreview';

class FakePeerConnection {
  iceGatheringState: RTCIceGatheringState = 'complete';
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescription | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  close = vi.fn();
  addTransceiver = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  createOffer = vi.fn(async () => ({ type: 'offer' as RTCSdpType, sdp: 'offer-sdp' }));
  setLocalDescription = vi.fn(async (offer: RTCSessionDescriptionInit) => {
    this.localDescription = { type: offer.type!, sdp: offer.sdp! } as RTCSessionDescription;
  });
  setRemoteDescription = vi.fn(async () => {
    this.ontrack?.({ streams: [{} as MediaStream] } as unknown as RTCTrackEvent);
  });
}

describe('CameraLivePreview WebRTC', () => {
  let peer: FakePeerConnection;
  const fetchMock = vi.fn();

  beforeEach(() => {
    peer = new FakePeerConnection();
    function PeerConnectionMock() { return peer; }
    vi.stubGlobal('RTCPeerConnection', PeerConnectionMock);
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, writable: true, value: null });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    fetchMock.mockResolvedValue(new Response('answer-sdp', {
      status: 201,
      headers: { Location: '/iphone/whep/session-id' },
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('creates a WHEP session and reports live only after a media track arrives', async () => {
    const onStateChange = vi.fn();
    render(<CameraLivePreview cameraId="camera-1" enabled whepUrl="https://stream.example.test/iphone/whep" onStateChange={onStateChange} />);

    expect(screen.getByText('Connecting to camera…')).toBeInTheDocument();
    expect(await screen.findByText('WEBRTC · LIVE')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('https://stream.example.test/iphone/whep', expect.objectContaining({
      method: 'POST',
      body: 'offer-sdp',
    }));
    expect(onStateChange).toHaveBeenLastCalledWith('live', undefined);
  });

  it('closes both the peer and WHEP session when preview stops', async () => {
    const { rerender } = render(<CameraLivePreview cameraId="camera-1" enabled whepUrl="https://stream.example.test/iphone/whep" />);
    await screen.findByText('WEBRTC · LIVE');

    rerender(<CameraLivePreview cameraId="camera-1" enabled={false} whepUrl="https://stream.example.test/iphone/whep" />);

    expect(peer.close).toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      'https://stream.example.test/iphone/whep/session-id',
      expect.objectContaining({ method: 'DELETE' }),
    ));
    expect(screen.getByText('Live view is stopped')).toBeInTheDocument();
  });
});
