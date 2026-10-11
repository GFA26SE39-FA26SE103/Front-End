import { afterAll, beforeAll } from 'vitest';

// JSDOM does not implement native dialog opening/closing. Real focus trapping and Escape are checked in Edge.
export function mockNativeDialogs() {
  const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
  });
  afterAll(() => {
    for (const [name, value] of [['showModal', show], ['close', close]] as const) {
      if (value) Object.defineProperty(HTMLDialogElement.prototype, name, value);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
  });
}
