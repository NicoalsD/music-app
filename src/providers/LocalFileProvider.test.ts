import { LocalFileProvider } from './LocalFileProvider';
import type { LocalMetadata } from './LocalFileProvider';

const noTags: LocalMetadata = {
  title: null,
  artists: [],
  album: null,
  durationMs: null,
  picture: null,
};

function setup(metadata: LocalMetadata | ((file: File) => Promise<LocalMetadata>) = noTags) {
  const created: string[] = [];
  const revoked: string[] = [];
  let counter = 0;
  let idCounter = 0;
  const provider = new LocalFileProvider({
    parseMetadata: typeof metadata === 'function' ? metadata : () => Promise.resolve(metadata),
    createObjectUrl: () => {
      counter += 1;
      const url = `blob:fake-${counter}`;
      created.push(url);
      return url;
    },
    revokeObjectUrl: (url) => revoked.push(url),
    canPlayType: (mime) => (mime.startsWith('audio/') ? 'maybe' : ''),
    ids: {
      next: () => {
        idCounter += 1;
        return `id-${idCounter}`;
      },
    },
  });
  return { provider, created, revoked };
}

const audio = (name: string, type = 'audio/mpeg'): File => new File(['x'], name, { type });

describe('LocalFileProvider.importFiles', () => {
  it('rejects unsupported formats without parsing them', async () => {
    const parse = vi.fn(() => Promise.resolve(noTags));
    const { provider, created } = setup(parse);
    const result = await provider.importFiles([
      audio('notes.txt', 'text/plain'),
      audio('video.mp4', ''),
    ]);
    expect(result.tracks).toEqual([]);
    expect(result.rejected).toEqual([
      { fileName: 'notes.txt', reason: 'unsupported' },
      { fileName: 'video.mp4', reason: 'unsupported' },
    ]);
    expect(parse).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });

  it('falls back to the file name without extension and to empty tags', async () => {
    const { provider } = setup();
    const { tracks } = await provider.importFiles([audio('My Song.final.mp3'), audio('noext')]);
    expect(tracks[0]).toEqual({
      trackId: 'local:id-1',
      source: 'local',
      uri: 'blob:fake-1',
      title: 'My Song.final',
      artists: [],
      album: { id: null, name: '' },
      durationMs: 0,
      artwork: {},
      explicit: false,
      externalUrl: null,
    });
    expect(tracks[1]?.title).toBe('noext');
  });

  it('keeps a leading dot in the file name', async () => {
    const { provider } = setup();
    const { tracks } = await provider.importFiles([audio('.hidden')]);
    expect(tracks[0]?.title).toBe('.hidden');
  });

  it('uses tags when present', async () => {
    const { provider } = setup({
      title: ' Real Title ',
      artists: ['A', ' ', 'B'],
      album: 'The Album',
      durationMs: 183500,
      picture: null,
    });
    const { tracks } = await provider.importFiles([audio('file.mp3')]);
    expect(tracks[0]).toMatchObject({
      title: 'Real Title',
      artists: ['A', 'B'],
      album: { id: null, name: 'The Album' },
      durationMs: 183500,
    });
  });

  it('treats a blank title tag and a negative duration as missing', async () => {
    const { provider } = setup({ ...noTags, title: '  ', durationMs: -5 });
    const { tracks } = await provider.importFiles([audio('fallback.ogg', 'audio/ogg')]);
    expect(tracks[0]).toMatchObject({ title: 'fallback', durationMs: 0 });
  });

  it('exposes embedded artwork as an object url for every size', async () => {
    const { provider, created } = setup({
      ...noTags,
      picture: { data: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
    });
    const { tracks } = await provider.importFiles([audio('a.mp3')]);
    expect(created).toHaveLength(2);
    expect(tracks[0]?.uri).toBe('blob:fake-1');
    expect(tracks[0]?.artwork).toEqual({
      small: 'blob:fake-2',
      medium: 'blob:fake-2',
      large: 'blob:fake-2',
    });
  });

  it('rejects unreadable files and keeps importing the rest', async () => {
    const { provider, created, revoked } = setup((file) =>
      file.name === 'bad.mp3' ? Promise.reject(new Error('corrupt')) : Promise.resolve(noTags),
    );
    const { tracks, rejected } = await provider.importFiles([audio('bad.mp3'), audio('good.mp3')]);
    expect(rejected).toEqual([{ fileName: 'bad.mp3', reason: 'unreadable' }]);
    expect(tracks.map((t) => t.title)).toEqual(['good']);
    expect(created).toHaveLength(1);
    expect(revoked).toHaveLength(0);
  });

  it('revokes already created urls when artwork creation fails', async () => {
    const revoked: string[] = [];
    let calls = 0;
    const provider = new LocalFileProvider({
      parseMetadata: () =>
        Promise.resolve({
          ...noTags,
          picture: { data: new Uint8Array([1]), mimeType: 'image/png' },
        }),
      createObjectUrl: () => {
        calls += 1;
        if (calls === 2) throw new Error('no memory');
        return 'blob:audio';
      },
      revokeObjectUrl: (url) => revoked.push(url),
      canPlayType: () => 'probably',
      ids: { next: () => 'x' },
    });
    const { tracks, rejected } = await provider.importFiles([audio('a.mp3')]);
    expect(tracks).toEqual([]);
    expect(rejected).toEqual([{ fileName: 'a.mp3', reason: 'unreadable' }]);
    expect(revoked).toEqual(['blob:audio']);
  });
});

describe('LocalFileProvider.release', () => {
  it('revokes audio and artwork urls exactly once', async () => {
    const { provider, revoked } = setup({
      ...noTags,
      picture: { data: new Uint8Array([1]), mimeType: 'image/jpeg' },
    });
    const { tracks } = await provider.importFiles([audio('a.mp3'), audio('b.mp3')]);
    const first = tracks[0];
    if (first === undefined) throw new Error('expected a track');
    provider.release(first);
    provider.release(first);
    expect(revoked).toEqual(['blob:fake-1', 'blob:fake-2']);
  });

  it('revokes only the audio url when there is no artwork and ignores unknown tracks', async () => {
    const { provider, revoked } = setup();
    const { tracks } = await provider.importFiles([audio('a.mp3')]);
    const track = tracks[0];
    if (track === undefined) throw new Error('expected a track');
    provider.release({ ...track, trackId: 'local:unknown' });
    expect(revoked).toEqual([]);
    provider.release(track);
    expect(revoked).toEqual(['blob:fake-1']);
  });
});
