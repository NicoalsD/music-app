/**
 * Whether a WebGL context can plausibly be created. Checks for the constructor first so jsdom
 * (which has no WebGL and logs a "not implemented" error on `getContext`) is never probed.
 */
export function canUseWebGl(): boolean {
  if (typeof window === 'undefined' || typeof window.WebGLRenderingContext === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch {
    return false;
  }
}
