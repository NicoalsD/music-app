import { parseBlob } from 'music-metadata';
import type { LocalMetadata } from './LocalFileProvider';

/** Default `parseMetadata`: reads ID3/Vorbis/MP4 tags with music-metadata. */
export async function parseMetadata(file: File): Promise<LocalMetadata> {
  const { common, format } = await parseBlob(file);
  const picture = common.picture?.[0];
  const artists = common.artists ?? (common.artist === undefined ? [] : [common.artist]);
  return {
    title: common.title ?? null,
    artists,
    album: common.album ?? null,
    durationMs: format.duration === undefined ? null : Math.round(format.duration * 1000),
    picture: picture === undefined ? null : { data: new Uint8Array(picture.data), mimeType: picture.format },
  };
}
