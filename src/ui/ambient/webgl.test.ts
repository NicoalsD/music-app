import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseWebGl } from './webgl';

describe('canUseWebGl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is false in jsdom, which has no WebGL', () => {
    expect(canUseWebGl()).toBe(false);
  });

  it('is true when a context can be created', () => {
    vi.stubGlobal('WebGLRenderingContext', function WebGLRenderingContext() {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
    expect(canUseWebGl()).toBe(true);
  });

  it('is false when the constructor exists but no context is available', () => {
    vi.stubGlobal('WebGLRenderingContext', function WebGLRenderingContext() {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(canUseWebGl()).toBe(false);
  });

  it('is false when creating the context throws', () => {
    vi.stubGlobal('WebGLRenderingContext', function WebGLRenderingContext() {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(canUseWebGl()).toBe(false);
  });
});
