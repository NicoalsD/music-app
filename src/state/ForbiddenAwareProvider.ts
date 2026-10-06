import type {
  AlbumDetail,
  ArtistDetail,
  MusicProvider,
  SearchQuery,
  SearchResults,
} from '../providers/MusicProvider';
import { SpotifyForbiddenError } from '../providers/SpotifyApiClient';

/** Reports Spotify 403s (allowlist or Premium) so the UI can show the right notice. */
export class ForbiddenAwareProvider implements MusicProvider {
  readonly #inner: MusicProvider;
  readonly #onForbidden: () => void;
  readonly #onSuccess: () => void;

  constructor(inner: MusicProvider, onForbidden: () => void, onSuccess: () => void) {
    this.#inner = inner;
    this.#onForbidden = onForbidden;
    this.#onSuccess = onSuccess;
  }

  search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResults> {
    return this.#track(this.#inner.search(query, signal));
  }

  getAlbum(albumId: string, signal?: AbortSignal): Promise<AlbumDetail> {
    return this.#track(this.#inner.getAlbum(albumId, signal));
  }

  getArtist(artistId: string, signal?: AbortSignal): Promise<ArtistDetail> {
    return this.#track(this.#inner.getArtist(artistId, signal));
  }

  async #track<T>(request: Promise<T>): Promise<T> {
    try {
      const value = await request;
      this.#onSuccess();
      return value;
    } catch (error) {
      if (error instanceof SpotifyForbiddenError) this.#onForbidden();
      throw error;
    }
  }
}
