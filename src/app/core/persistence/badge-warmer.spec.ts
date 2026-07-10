import { vi } from 'vitest';
import { warmImageCache } from './badge-warmer';

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  static instances: FakeImage[] = [];

  set src(value: string) {
    this._src = value;
    FakeImage.instances.push(this);
  }

  get src() {
    return this._src;
  }
}

describe('warmImageCache', () => {
  const originalImage = globalThis.Image;

  beforeEach(() => {
    FakeImage.instances = [];
    (globalThis as unknown as { Image: typeof Image }).Image = FakeImage as unknown as typeof Image;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
    vi.useRealTimers();
  });

  it('resolves once every image has loaded', async () => {
    const promise = warmImageCache(['https://a.test/1.png', 'https://a.test/2.png']);

    expect(FakeImage.instances).toHaveLength(2);
    FakeImage.instances.forEach(img => img.onload?.());

    await expect(promise).resolves.toBeUndefined();
  });

  it('does not fail the batch when one image errors', async () => {
    const promise = warmImageCache(['https://a.test/1.png', 'https://a.test/broken.png']);

    FakeImage.instances[0].onload?.();
    FakeImage.instances[1].onerror?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it('gives up on a single image after the timeout without blocking the batch', async () => {
    vi.useFakeTimers();
    const promise = warmImageCache(['https://a.test/slow.png'], { timeoutMs: 5000 });

    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).resolves.toBeUndefined();
  });

  it('dedupes repeated URLs into a single request', () => {
    warmImageCache(['https://a.test/1.png', 'https://a.test/1.png']);
    expect(FakeImage.instances).toHaveLength(1);
  });

  it('reports progress as each image settles', async () => {
    const onProgress = vi.fn();
    const promise = warmImageCache(['https://a.test/1.png', 'https://a.test/2.png'], { onProgress });

    FakeImage.instances[0].onload?.();
    await Promise.resolve();
    FakeImage.instances[1].onload?.();
    await promise;

    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('resolves immediately with an empty list', async () => {
    await expect(warmImageCache([])).resolves.toBeUndefined();
  });
});
