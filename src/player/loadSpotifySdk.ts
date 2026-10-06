import { PlaybackError } from '../core/errors';
import type { SpotifySdkLike, SpotifyTimers } from './SpotifyOutput';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

let sdkPromise: Promise<SpotifySdkLike> | null = null;

/** Injects the Web Playback SDK script once and resolves when it is ready. */
export function loadSpotifySdk(): Promise<SpotifySdkLike> {
  if (sdkPromise !== null) return sdkPromise;
  sdkPromise = new Promise<SpotifySdkLike>((resolve, reject) => {
    if (typeof window.Spotify !== 'undefined') {
      resolve(window.Spotify);
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      sdkPromise = null;
      script.remove();
      reject(new PlaybackError('spotify-sdk-load-failed'));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export const browserSpotifyTimers: SpotifyTimers = {
  setInterval: (handler, ms) => window.setInterval(handler, ms),
  clearInterval: (handle) => window.clearInterval(handle),
};

export function browserSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
