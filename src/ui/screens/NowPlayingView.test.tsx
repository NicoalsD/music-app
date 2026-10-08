import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../app/App';
import { makeTrack } from '../../core/test-utils/fakes';
import { createHarness } from '../../state/test-utils/harness';
import { FakeLyricsProvider } from '../../state/test-utils/FakeLyricsProvider';
import { strings } from '../i18n/es';

const lyrics = {
  kind: 'synced',
  lines: [
    { timeMs: 0, text: 'Opening words' },
    { timeMs: 5_000, text: 'Later words' },
  ],
} as const;

function setup() {
  const h = createHarness();
  const provider = new FakeLyricsProvider(lyrics);
  const view = render(<App store={h.store} lyricsProvider={provider} />);
  act(() =>
    h.store.addLast({
      ...makeTrack('a', 10_000),
      artists: ['Main', 'Guest'],
      album: { id: null, name: 'Blue Album' },
      artwork: { large: 'cover.jpg' },
    }),
  );
  return { ...view, h, provider, user: userEvent.setup() };
}

const dialog = () => screen.getByRole('dialog', { name: strings.nowPlaying.title });

describe('NowPlayingView', () => {
  it('is closed until the cover is clicked, then shows title, artists and album', async () => {
    const { user } = setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.open }));
    const view = within(dialog());
    expect(view.getByRole('heading', { name: 'Title a' })).toBeInTheDocument();
    expect(view.getByText('Main, Guest')).toBeInTheDocument();
    expect(view.getByText('Blue Album')).toBeInTheDocument();
    expect(view.getByRole('img', { name: 'Portada de Blue Album' })).toBeInTheDocument();
  });

  it('opens from the expand button and moves focus to the title', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.title }));
    expect(within(dialog()).getByRole('heading', { name: 'Title a' })).toHaveFocus();
  });

  it('closes with Escape and returns focus to the button that opened it', async () => {
    const { user } = setup();
    const trigger = screen.getByRole('button', { name: strings.nowPlaying.title });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes with the close button', async () => {
    const { user } = setup();
    const cover = screen.getByRole('button', { name: strings.nowPlaying.open });
    await user.click(cover);
    await user.click(within(dialog()).getByRole('button', { name: strings.nowPlaying.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cover).toHaveFocus();
  });

  it('opens from "Letra" with the lyrics column showing the current song lyrics', async () => {
    const { user, provider } = setup();
    await user.click(screen.getByRole('button', { name: strings.lyrics.title }));
    const view = within(dialog());
    expect(await view.findByRole('button', { name: 'Opening words' })).toBeInTheDocument();
    expect(view.getByRole('region', { name: strings.lyrics.title })).toBeInTheDocument();
    expect(provider.queries[0]?.artist).toBe('Main');
  });

  it('toggles the lyrics column from the toolbar and remembers it for the next opening', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.title }));
    const hide = within(dialog()).getByRole('button', { name: strings.nowPlaying.hideLyrics });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    await user.click(hide);
    expect(within(dialog()).queryByRole('region', { name: strings.lyrics.title })).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.title }));
    expect(
      within(dialog()).getByRole('button', { name: strings.nowPlaying.showLyrics }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('shares the transport with the player bar', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.title }));
    const view = within(dialog());
    await user.click(view.getByRole('button', { name: strings.player.play }));
    expect(await view.findByRole('button', { name: strings.player.pause })).toBeInTheDocument();
    expect(view.getByRole('button', { name: strings.player.next })).toBeInTheDocument();
    expect(view.getByRole('button', { name: strings.player.shuffle })).toBeInTheDocument();
    expect(view.getByRole('slider', { name: strings.player.volume })).toBeInTheDocument();
  });

  it('keeps the space shortcut working inside the view', async () => {
    const { user, h } = setup();
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.title }));
    await user.keyboard(' ');
    await waitFor(() => expect(h.store.getSnapshot().player.status).toBe('playing'));
  });

  it('follows the current song when it changes', async () => {
    const { user, h } = setup();
    act(() => h.store.addLast(makeTrack('b')));
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.title }));
    act(() => h.store.next());
    expect(within(dialog()).getByRole('heading', { name: 'Title b' })).toBeInTheDocument();
  });

  it('shows an empty state when nothing is playing', async () => {
    const h = createHarness();
    const user = userEvent.setup();
    render(<App store={h.store} lyricsProvider={new FakeLyricsProvider()} />);
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.title }));
    expect(
      within(dialog()).getByRole('heading', { name: strings.player.nothingPlaying }),
    ).toBeInTheDocument();
  });
});
