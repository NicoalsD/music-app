import type { Artwork, Track } from '../core/Song';
import type { AlbumSummary, ArtistSummary } from './MusicProvider';
import { SpotifyResponseError } from './SpotifyApiClient';

type UnknownRecord = Record<string, unknown>;

export interface RawImage {
  readonly url: string;
  readonly width: number | null;
}
export interface RawArtistRef {
  readonly name: string;
}
export interface RawAlbumRef {
  readonly id: string;
  readonly name: string;
  readonly images: readonly RawImage[];
}
export interface RawTrack {
  readonly id: string;
  readonly uri: string;
  readonly name: string;
  readonly duration_ms: number;
  readonly explicit: boolean;
  readonly artists: readonly RawArtistRef[];
  readonly album: RawAlbumRef | null;
  readonly spotifyUrl: string | null;
}
export interface RawAlbum extends RawAlbumRef {
  readonly artists: readonly RawArtistRef[];
  readonly releaseDate: string | null;
  readonly totalTracks: number;
}
export interface RawArtist {
  readonly id: string;
  readonly name: string;
  readonly images: readonly RawImage[];
  readonly genres: readonly string[];
}
export interface RawPage<T> {
  readonly items: readonly T[];
  readonly next: string | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === 'string';

function isImage(value: unknown): value is RawImage {
  if (!isRecord(value) || !isString(value['url'])) return false;
  const width = value['width'];
  return width === undefined || width === null || typeof width === 'number';
}

function isImageList(value: unknown): value is readonly RawImage[] {
  return Array.isArray(value) && value.every(isImage);
}

function isArtistRefList(value: unknown): value is readonly RawArtistRef[] {
  return Array.isArray(value) && value.every((item) => isRecord(item) && isString(item['name']));
}

function normalizeImages(value: UnknownRecord): readonly RawImage[] | null {
  const images = value['images'];
  if (images === undefined) return [];
  if (!isImageList(images)) return null;
  return images.map((image) => ({ url: image.url, width: typeof image.width === 'number' ? image.width : null }));
}

/** Parses a track object; returns null when malformed. */
export function parseTrack(value: unknown): RawTrack | null {
  if (!isRecord(value)) return null;
  const { id, uri, name, duration_ms: duration, artists } = value;
  if (!isString(id) || !isString(uri) || !isString(name)) return null;
  if (typeof duration !== 'number' || !Number.isFinite(duration)) return null;
  if (!isArtistRefList(artists)) return null;
  const explicit = value['explicit'];
  if (explicit !== undefined && typeof explicit !== 'boolean') return null;
  let album: RawAlbumRef | null = null;
  if (value['album'] !== undefined) {
    const parsed = parseAlbumRef(value['album']);
    if (parsed === null) return null;
    album = parsed;
  }
  const urls = value['external_urls'];
  const spotifyUrl = isRecord(urls) && isString(urls['spotify']) ? urls['spotify'] : null;
  return { id, uri, name, duration_ms: duration, explicit: explicit ?? false, artists, album, spotifyUrl };
}

export function parseAlbumRef(value: unknown): RawAlbumRef | null {
  if (!isRecord(value) || !isString(value['id']) || !isString(value['name'])) return null;
  const images = normalizeImages(value);
  return images === null ? null : { id: value['id'], name: value['name'], images };
}

export function parseAlbum(value: unknown): RawAlbum | null {
  const ref = parseAlbumRef(value);
  if (ref === null || !isRecord(value)) return null;
  const artists = value['artists'];
  if (!isArtistRefList(artists)) return null;
  const releaseDate = value['release_date'];
  const total = value['total_tracks'];
  return {
    ...ref,
    artists,
    releaseDate: isString(releaseDate) ? releaseDate : null,
    totalTracks: typeof total === 'number' && Number.isFinite(total) ? total : 0,
  };
}

export function parseArtist(value: unknown): RawArtist | null {
  if (!isRecord(value) || !isString(value['id']) || !isString(value['name'])) return null;
  const images = normalizeImages(value);
  if (images === null) return null;
  const genres = value['genres'] ?? [];
  if (!Array.isArray(genres) || !genres.every(isString)) return null;
  return { id: value['id'], name: value['name'], images, genres };
}

/** Parses a paging object. Null items (Spotify sometimes sends them) are dropped. */
export function parsePage<T>(value: unknown, parseItem: (item: unknown) => T | null): RawPage<T> | null {
  if (!isRecord(value) || !Array.isArray(value['items'])) return null;
  const next = value['next'];
  if (next !== null && !isString(next)) return null;
  const items: T[] = [];
  for (const raw of value['items'] as unknown[]) {
    if (raw === null) continue;
    const parsed = parseItem(raw);
    if (parsed === null) return null;
    items.push(parsed);
  }
  return { items, next };
}

const TARGET_WIDTHS = { small: 64, medium: 300, large: 640 } as const;

function closest(images: readonly RawImage[], target: number): RawImage | undefined {
  let best: RawImage | undefined;
  let bestDistance = Infinity;
  for (const image of images) {
    if (image.width === null) continue;
    const distance = Math.abs(image.width - target);
    if (distance < bestDistance) {
      best = image;
      bestDistance = distance;
    }
  }
  return best;
}

/** Picks the image closest to 64 / 300 / 640 px for each artwork slot. */
export function pickArtwork(images: readonly RawImage[]): Artwork {
  const first = images[0];
  if (first === undefined) return {};
  const pick = (target: number): string => (closest(images, target) ?? first).url;
  return { small: pick(TARGET_WIDTHS.small), medium: pick(TARGET_WIDTHS.medium), large: pick(TARGET_WIDTHS.large) };
}

export function mapTrack(raw: RawTrack, fallbackAlbum: RawAlbumRef | null): Track {
  const album = raw.album ?? fallbackAlbum;
  if (album === null) throw new SpotifyResponseError(`Track ${raw.id} has no album`);
  return {
    trackId: raw.id,
    source: 'spotify',
    uri: raw.uri,
    title: raw.name,
    artists: raw.artists.map((artist) => artist.name),
    album: { id: album.id, name: album.name },
    durationMs: raw.duration_ms,
    artwork: pickArtwork(album.images),
    explicit: raw.explicit,
    externalUrl: raw.spotifyUrl,
  };
}

export function mapAlbumSummary(raw: RawAlbum): AlbumSummary {
  const year = raw.releaseDate === null ? NaN : Number.parseInt(raw.releaseDate.slice(0, 4), 10);
  return {
    id: raw.id,
    name: raw.name,
    artists: raw.artists.map((artist) => artist.name),
    artwork: pickArtwork(raw.images),
    releaseYear: Number.isFinite(year) ? year : null,
    totalTracks: raw.totalTracks,
  };
}

export function mapArtistSummary(raw: RawArtist): ArtistSummary {
  return { id: raw.id, name: raw.name, artwork: pickArtwork(raw.images), genres: raw.genres };
}

export { isRecord };
