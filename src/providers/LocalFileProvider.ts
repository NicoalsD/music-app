import type { IdGenerator } from '../core/ports';
import type { Artwork, Track } from '../core/Song';

export interface LocalPicture {
  readonly data: Uint8Array<ArrayBuffer>;
  readonly mimeType: string;
}

/** Tag data read from an audio file. Every field may be missing. */
export interface LocalMetadata {
  readonly title: string | null;
  readonly artists: readonly string[];
  readonly album: string | null;
  readonly durationMs: number | null;
  readonly picture: LocalPicture | null;
}

export type RejectionReason = 'unsupported' | 'unreadable';

export interface RejectedFile {
  readonly fileName: string;
  readonly reason: RejectionReason;
}

export interface ImportResult {
  readonly tracks: Track[];
  readonly rejected: RejectedFile[];
}

export interface LocalFileProviderDeps {
  readonly parseMetadata: (file: File) => Promise<LocalMetadata>;
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
  readonly canPlayType: (mimeType: string) => string;
  readonly ids: IdGenerator;
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Turns user-selected audio files into Tracks and owns their object URLs. */
export class LocalFileProvider {
  readonly #deps: LocalFileProviderDeps;
  /** Object URLs created per track, so release() revokes exactly those. */
  readonly #urls = new Map<string, readonly string[]>();

  constructor(deps: LocalFileProviderDeps) {
    this.#deps = deps;
  }

  async importFiles(files: readonly File[]): Promise<ImportResult> {
    const tracks: Track[] = [];
    const rejected: RejectedFile[] = [];
    for (const file of files) {
      if (this.#deps.canPlayType(file.type) === '') {
        rejected.push({ fileName: file.name, reason: 'unsupported' });
        continue;
      }
      try {
        tracks.push(await this.#toTrack(file));
      } catch {
        rejected.push({ fileName: file.name, reason: 'unreadable' });
      }
    }
    return { tracks, rejected };
  }

  /** Revokes the audio and artwork URLs of a track. Safe to call more than once. */
  release(track: Track): void {
    const urls = this.#urls.get(track.trackId);
    if (urls === undefined) return;
    this.#urls.delete(track.trackId);
    for (const url of urls) this.#deps.revokeObjectUrl(url);
  }

  async #toTrack(file: File): Promise<Track> {
    const metadata = await this.#deps.parseMetadata(file);
    const created: string[] = [];
    try {
      const audioUrl = this.#deps.createObjectUrl(file);
      created.push(audioUrl);
      let artwork: Artwork = {};
      if (metadata.picture !== null) {
        const blob = new Blob([metadata.picture.data], { type: metadata.picture.mimeType });
        const artworkUrl = this.#deps.createObjectUrl(blob);
        created.push(artworkUrl);
        artwork = { small: artworkUrl, medium: artworkUrl, large: artworkUrl };
      }
      const title = metadata.title?.trim() ?? '';
      const albumName = metadata.album?.trim() ?? '';
      const trackId = `local:${this.#deps.ids.next()}`;
      this.#urls.set(trackId, created);
      return {
        trackId,
        source: 'local',
        uri: audioUrl,
        title: title === '' ? stripExtension(file.name) : title,
        artists: metadata.artists.map((artist) => artist.trim()).filter((artist) => artist !== ''),
        album: { id: null, name: albumName },
        durationMs:
          metadata.durationMs !== null && metadata.durationMs > 0 ? metadata.durationMs : 0,
        artwork,
        explicit: false,
        externalUrl: null,
      };
    } catch (error) {
      for (const url of created) this.#deps.revokeObjectUrl(url);
      throw error;
    }
  }
}
