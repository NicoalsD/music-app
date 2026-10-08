import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import type { ArtistSummary } from '../../providers/MusicProvider';
import type { FeedResult, PersonalFeedProvider } from '../../providers/PersonalFeedProvider';
import { createHarness } from '../../state/test-utils/harness';
import { strings } from '../i18n/es';
import { HomeView } from './HomeView';
import { RECENT_COUNT, greetingFor } from './homeData';
import { renderWithStore } from './test-utils/render';

function setup(hour = 9) {
  const onOpenPlaylist = vi.fn();
  const onGoToSearch = vi.fn();
  const view = renderWithStore(
    <HomeView onOpenPlaylist={onOpenPlaylist} onGoToSearch={onGoToSearch} hour={hour} />,
  );
  return { ...view, onOpenPlaylist, onGoToSearch, user: userEvent.setup() };
}

describe('greetingFor', () => {
  it.each([
    [6, strings.home.greetingMorning],
    [12, strings.home.greetingMorning],
    [13, strings.home.greetingAfternoon],
    [19, strings.home.greetingAfternoon],
    [20, strings.home.greetingEvening],
    [3, strings.home.greetingEvening],
  ])('at %i o clock says %s', (hour, expected) => {
    expect(greetingFor(hour)).toBe(expected);
  });
});

describe('HomeView', () => {
  it('shows the greeting and an empty state with search and import actions', async () => {
    const { onGoToSearch, user } = setup(21);
    expect(
      screen.getByRole('heading', { level: 2, name: strings.home.greetingEvening }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: strings.home.emptyTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.library.importFiles })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: strings.home.continueTitle }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.home.emptySearch }));
    expect(onGoToSearch).toHaveBeenCalledTimes(1);
  });

  it('continues with the current song and toggles playback', async () => {
    const { h, user } = setup();
    act(() => {
      h.store.addLast(makeTrack('a'));
      h.store.addLast(makeTrack('b'));
    });
    const section = within(screen.getByRole('region', { name: strings.home.continueTitle }));
    expect(section.getByText('Title a')).toBeInTheDocument();
    await user.click(section.getByRole('button', { name: strings.player.play }));
    expect(h.store.getSnapshot().player.status).not.toBe('idle');
    expect(await section.findByRole('button', { name: strings.player.pause })).toBeInTheDocument();
  });

  it('opens the active playlist from "Ver en la lista"', async () => {
    const { h, onOpenPlaylist, user } = setup();
    act(() => h.store.addLast(makeTrack('a')));
    await user.click(screen.getByRole('button', { name: strings.home.openInList }));
    expect(onOpenPlaylist).toHaveBeenCalledWith(h.store.getSnapshot().activePlaylistId);
  });

  it('shows one tile per playlist, marks the active one and opens it', async () => {
    const { h, onOpenPlaylist, user } = setup();
    await act(async () => {
      h.store.addLast(makeTrack('a'));
      await h.store.createPlaylist('Rock');
    });
    const tiles = within(screen.getByRole('region', { name: strings.home.playlistsTitle }));
    const rock = tiles.getByRole('button', {
      name: strings.home.openPlaylistTile('Rock', strings.playlist.songCount(0)),
    });
    expect(rock).toHaveAttribute('aria-current', 'true');
    expect(within(rock).getByText(strings.home.activeBadge)).toBeInTheDocument();
    const first = tiles.getByRole('button', {
      name: strings.home.openPlaylistTile('Mi lista', strings.playlist.songCount(1)),
    });
    expect(first).not.toHaveAttribute('aria-current');
    await user.click(first);
    expect(onOpenPlaylist).toHaveBeenCalledWith(h.store.getSnapshot().playlists[0]?.id);
  });

  it('lists the latest additions first, capped, and plays one on click', async () => {
    const { h, user } = setup();
    act(() => {
      for (let i = 0; i < RECENT_COUNT + 2; i += 1) h.store.addLast(makeTrack(`s${i}`));
    });
    const recent = within(screen.getByRole('region', { name: strings.home.recentTitle }));
    const rows = recent.getAllByRole('button');
    expect(rows).toHaveLength(RECENT_COUNT);
    expect(rows[0]).toHaveAccessibleName(
      strings.playlist.playSongNamed(`Title s${RECENT_COUNT + 1}`),
    );
    await user.click(rows[1] as HTMLElement);
    expect(h.store.getSnapshot().currentIndex).toBe(RECENT_COUNT);
  });
});

class FakeFeed implements PersonalFeedProvider {
  recent: () => Promise<FeedResult<ReturnType<typeof makeTrack>>> = () =>
    Promise.resolve({ status: 'ready', items: [makeTrack('r1'), makeTrack('r2')] });
  top: () => Promise<FeedResult<ReturnType<typeof makeTrack>>> = () =>
    Promise.resolve({ status: 'ready', items: [makeTrack('t1')] });
  artists: () => Promise<FeedResult<ArtistSummary>> = () =>
    Promise.resolve({
      status: 'ready',
      items: [{ id: 'ar1', name: 'Artist One', artwork: {}, genres: [] }],
    });
  saved: () => Promise<FeedResult<ReturnType<typeof makeTrack>>> = () =>
    Promise.resolve({ status: 'ready', items: [makeTrack('s1')] });
  recentlyPlayed() {
    return this.recent();
  }
  topTracks() {
    return this.top();
  }
  topArtists() {
    return this.artists();
  }
  savedTracks() {
    return this.saved();
  }
}

function setupFeed(
  feed: FakeFeed,
  options: { loggedIn?: boolean; onOpenArtist?: (id: string) => void } = {},
) {
  const harness = createHarness();
  harness.auth.loggedIn = options.loggedIn ?? true;
  const view = renderWithStore(
    <HomeView
      onOpenPlaylist={vi.fn()}
      onGoToSearch={vi.fn()}
      hour={9}
      feedProvider={feed}
      {...(options.onOpenArtist ? { onOpenArtist: options.onOpenArtist } : {})}
    />,
    { harness },
  );
  if (harness.auth.loggedIn) act(() => harness.auth.emit('logged-in'));
  return { ...view, h: harness, user: userEvent.setup() };
}

describe('HomeView personal feed', () => {
  it('invites to connect Spotify when logged out and requests nothing', async () => {
    const feed = new FakeFeed();
    const spy = vi.spyOn(feed, 'recentlyPlayed');
    const { h, user } = setupFeed(feed, { loggedIn: false });
    expect(spy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: strings.home.connectAction }));
    expect(h.auth.loginCalls).toBe(1);
  });

  it('shows a loading status per section, then the sections', async () => {
    setupFeed(new FakeFeed());
    expect(screen.getAllByRole('status')).toHaveLength(4);
    await screen.findByRole('button', { name: strings.home.addTileToEnd('Title s1') });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    for (const title of [
      strings.home.feedRecentTitle,
      strings.home.feedTopTracksTitle,
      strings.home.feedTopArtistsTitle,
      strings.home.feedSavedTitle,
    ]) {
      expect(screen.getByRole('region', { name: title })).toBeVisible();
    }
  });

  it('plays a recently played tile now on click', async () => {
    const { h, user } = setupFeed(new FakeFeed());
    await user.click(
      await screen.findByRole('button', { name: strings.home.playTile('Title r2', 'Artist') }),
    );
    expect(h.store.getSnapshot().songs.map((s) => s.title)).toContain('Title r2');
    expect(h.store.getSnapshot().player.status).not.toBe('idle');
  });

  it('adds a saved tile to the end of the list', async () => {
    const { h, user } = setupFeed(new FakeFeed());
    await user.click(
      await screen.findByRole('button', { name: strings.home.addTileToEnd('Title s1') }),
    );
    expect(h.store.getSnapshot().songs.map((s) => s.title)).toEqual(['Title s1']);
  });

  it('exposes labelled previous and next buttons on each shelf', async () => {
    const { user } = setupFeed(new FakeFeed());
    await screen.findByRole('button', { name: strings.home.addTileToEnd('Title r1') });
    const shelf = within(screen.getByRole('region', { name: strings.home.feedRecentTitle }));
    const next = shelf.getByRole('button', {
      name: strings.home.shelfNext(strings.home.feedRecentTitle),
    });
    await user.click(next);
    expect(
      shelf.getByRole('button', { name: strings.home.shelfPrevious(strings.home.feedRecentTitle) }),
    ).toBeInTheDocument();
  });

  it('opens an artist when the shell allows it', async () => {
    const onOpenArtist = vi.fn();
    const { user } = setupFeed(new FakeFeed(), { onOpenArtist });
    await user.click(
      await screen.findByRole('button', { name: strings.home.openArtist('Artist One') }),
    );
    expect(onOpenArtist).toHaveBeenCalledWith('ar1');
  });

  it('shows artists without a link when the shell cannot open them', async () => {
    setupFeed(new FakeFeed());
    expect(await screen.findByText('Artist One')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: strings.home.openArtist('Artist One') }),
    ).not.toBeInTheDocument();
  });

  it('asks to reconnect when a section lacks permission and logs in again', async () => {
    const feed = new FakeFeed();
    feed.recent = () => Promise.resolve({ status: 'needsReconnect' });
    const { h, user } = setupFeed(feed);
    const button = await screen.findByRole('button', { name: strings.home.reconnectAction });
    expect(screen.getByRole('heading', { name: strings.home.reconnectTitle })).toBeInTheDocument();
    await user.click(button);
    expect(h.auth.loginCalls).toBe(1);
    // The other sections keep working.
    expect(screen.getByRole('region', { name: strings.home.feedSavedTitle })).toBeVisible();
  });

  it('shows empty, unavailable and error notices, and retries the failed section', async () => {
    const feed = new FakeFeed();
    feed.recent = () => Promise.resolve({ status: 'ready', items: [] });
    feed.top = () => Promise.resolve({ status: 'unavailable' });
    let fail = true;
    feed.saved = () =>
      fail
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ status: 'ready', items: [makeTrack('s9')] });
    const { user } = setupFeed(feed);
    await screen.findByText(strings.home.feedError);
    const failed = within(screen.getByRole('region', { name: strings.home.feedSavedTitle }));
    expect(failed.getByText(strings.home.feedError)).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: strings.home.feedRecentTitle })).getByText(
        strings.home.feedEmpty,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: strings.home.feedTopTracksTitle })).getByText(
        strings.home.feedUnavailable,
      ),
    ).toBeInTheDocument();
    fail = false;
    await user.click(failed.getByRole('button', { name: strings.home.feedRetry }));
    expect(
      await screen.findByRole('button', { name: strings.home.addTileToEnd('Title s9') }),
    ).toBeInTheDocument();
  });
});
