import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { settle } from '../../player/test-utils/FakeAudioOutput';
import { spotifyTrack } from '../../state/test-utils/harness';
import { strings } from '../i18n/es';
import { PlayerBar } from './PlayerBar';
import { renderWithStore } from './test-utils/render';

function setup(...tracks: ReturnType<typeof makeTrack>[]) {
  const onOpenNowPlaying = vi.fn();
  const onToggleLyrics = vi.fn();
  const view = renderWithStore(
    <PlayerBar onOpenNowPlaying={onOpenNowPlaying} onToggleLyrics={onToggleLyrics} lyricsOpen />,
  );
  act(() => {
    for (const t of tracks) view.h.store.addLast(t);
  });
  return { ...view, onOpenNowPlaying, onToggleLyrics, user: userEvent.setup() };
}

describe('PlayerBar', () => {
  it('shows an idle bar with disabled transport when the list is empty', () => {
    setup();
    expect(screen.getByText(strings.player.nothingPlaying)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.player.play })).toBeDisabled();
    expect(screen.getByRole('button', { name: strings.player.next })).toBeDisabled();
    expect(screen.getByRole('button', { name: strings.player.previous })).toBeDisabled();
  });

  it('opens now playing from the cover and the expand button', async () => {
    const { onOpenNowPlaying, user } = setup(makeTrack('a'));
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.open }));
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.title }));
    expect(onOpenNowPlaying).toHaveBeenCalledTimes(2);
  });

  it('toggles the lyrics and reflects their state', async () => {
    const { onToggleLyrics, user } = setup(makeTrack('a'));
    const toggle = screen.getByRole('button', { name: strings.lyrics.title });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(onToggleLyrics).toHaveBeenCalledTimes(1);
  });

  it('shows title, artists and album of the current song', () => {
    setup(makeTrack('a'));
    expect(screen.getByText('Title a')).toBeInTheDocument();
    expect(screen.getByText('Artist · Album')).toBeInTheDocument();
  });

  it('toggles play and pause labels', async () => {
    const { user } = setup(makeTrack('a'));
    await user.click(screen.getByRole('button', { name: strings.player.play }));
    expect(await screen.findByRole('button', { name: strings.player.pause })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.player.pause }));
    expect(await screen.findByRole('button', { name: strings.player.play })).toBeInTheDocument();
  });

  it('shows a spinner while the song loads', async () => {
    const { h, user, container } = setup(makeTrack('a'));
    const spinner = () => container.querySelector(`[aria-label="${strings.player.loadingTrack}"]`);
    h.localOutput.manualLoads = true;
    await user.click(screen.getByRole('button', { name: strings.player.play }));
    expect(screen.getByRole('button', { name: strings.player.pause })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(spinner()).not.toBeNull();
    await act(async () => {
      h.localOutput.pendingLoads[0]?.resolve();
      await settle();
    });
    expect(spinner()).toBeNull();
  });

  it('announces the current track politely while playing', async () => {
    const { user } = setup(makeTrack('a'));
    await user.click(screen.getByRole('button', { name: strings.player.play }));
    expect(
      await screen.findByText(strings.player.announceTrack('Title a', 'Artist')),
    ).toBeInTheDocument();
  });

  it('cycles repeat off, all, one and back, with a 1 badge for one', async () => {
    const { user } = setup(makeTrack('a'));
    const repeat = (name: string) => screen.getByRole('button', { name });
    expect(repeat(strings.player.repeat.off)).toHaveAttribute('aria-pressed', 'false');
    await user.click(repeat(strings.player.repeat.off));
    expect(repeat(strings.player.repeat.all)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    await user.click(repeat(strings.player.repeat.all));
    expect(repeat(strings.player.repeat.one)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1')).toBeInTheDocument();
    await user.click(repeat(strings.player.repeat.one));
    expect(repeat(strings.player.repeat.off)).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles shuffle with aria-pressed', async () => {
    const { user } = setup(makeTrack('a'), makeTrack('b'));
    const shuffle = screen.getByRole('button', { name: strings.player.shuffle });
    expect(shuffle).toHaveAttribute('aria-pressed', 'false');
    await user.click(shuffle);
    expect(shuffle).toHaveAttribute('aria-pressed', 'true');
    await user.click(shuffle);
    expect(shuffle).toHaveAttribute('aria-pressed', 'false');
  });

  it('goes to the next and previous songs and shows the neighbour hints', async () => {
    const { h, user } = setup(makeTrack('a'), makeTrack('b'), makeTrack('c'));
    expect(screen.getByText(strings.player.nextHint('Title b'))).toBeInTheDocument();
    expect(screen.queryByText(/Anterior:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.player.next }));
    expect(h.store.getSnapshot().songs[1]?.isCurrent).toBe(true);
    expect(screen.getByText(strings.player.previousHint('Title a'))).toBeInTheDocument();
    expect(screen.getByText(strings.player.nextHint('Title c'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.player.next })).toHaveAccessibleDescription(
      strings.player.nextHint('Title c'),
    );
    await user.click(screen.getByRole('button', { name: strings.player.previous }));
    expect(h.store.getSnapshot().songs[0]?.isCurrent).toBe(true);
  });

  it('shows "Abrir en Spotify" only for Spotify songs', () => {
    const { h } = setup(spotifyTrack('s'));
    const link = screen.getByRole('link', { name: strings.player.openInSpotify });
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/track/s');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(h.store.getSnapshot().songs[0]?.source).toBe('spotify');
  });

  it('hides "Abrir en Spotify" for local files', () => {
    setup(makeTrack('l'));
    expect(
      screen.queryByRole('link', { name: strings.player.openInSpotify }),
    ).not.toBeInTheDocument();
  });

  it('mutes and unmutes with the matching labels, and exposes the volume slider', async () => {
    const { h, user } = setup(makeTrack('a'));
    const volume = screen.getByRole('slider', { name: strings.player.volume });
    expect(volume).toHaveAttribute('aria-valuetext', strings.player.volumeValue(100));
    await user.click(screen.getByRole('button', { name: strings.player.mute }));
    expect(h.store.getSnapshot().player.muted).toBe(true);
    expect(screen.getByRole('button', { name: strings.player.unmute })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('slider', { name: strings.player.volume })).toHaveAttribute(
      'aria-valuetext',
      strings.player.volumeValue(0),
    );
    await user.click(screen.getByRole('button', { name: strings.player.unmute }));
    expect(h.store.getSnapshot().player.muted).toBe(false);
  });

  it('changes the volume with the arrow keys in 5 percent steps', async () => {
    const { h, user } = setup(makeTrack('a'));
    screen.getByRole('slider', { name: strings.player.volume }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(h.store.getSnapshot().player.volume).toBeCloseTo(0.95);
  });

  it('shows progress through an accessible slider that follows the engine', async () => {
    const { h, user } = setup(makeTrack('a', 10_000));
    await user.click(screen.getByRole('button', { name: strings.player.play }));
    await act(async () => {
      h.localOutput.emit({ type: 'progress', positionMs: 4_000, durationMs: 10_000 });
    });
    expect(screen.getByRole('slider', { name: strings.player.progress })).toHaveAttribute(
      'aria-valuetext',
      strings.player.timeOf('0:04', '0:10'),
    );
  });

  it('seeks with the arrow keys on the progress slider', async () => {
    const { h, user } = setup(makeTrack('a', 20_000));
    await user.click(screen.getByRole('button', { name: strings.player.play }));
    screen.getByRole('slider', { name: strings.player.progress }).focus();
    await user.keyboard('{ArrowRight}');
    expect(h.localOutput.calls).toContain('seek:5000');
  });

  it('shows a translated error with a retry that plays again', async () => {
    const { h, user } = setup(makeTrack('a'));
    h.localOutput.failingUris.add('blob:a');
    await user.click(screen.getByRole('button', { name: strings.player.play }));
    expect(await screen.findByText(strings.errors['all-failed'])).toBeInTheDocument();
    h.localOutput.failingUris.clear();
    await user.click(screen.getByRole('button', { name: strings.player.retry }));
    expect(await screen.findByRole('button', { name: strings.player.pause })).toBeInTheDocument();
    expect(screen.queryByText(strings.errors['all-failed'])).not.toBeInTheDocument();
  });

  it('retries the Spotify connection when the player is not ready', async () => {
    const { h, user } = setup(spotifyTrack('s'));
    h.auth.loggedIn = true;
    h.spotify.setStatus('error');
    expect(await screen.findByText(strings.spotify.status.error)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.player.retry }));
    expect(h.spotify.initCalls).toBe(1);
  });

  it.each(['no-premium', 'unsupported'] as const)(
    'explains the Spotify problem %s without a retry',
    (status) => {
      const { h } = setup(spotifyTrack('s'));
      h.auth.loggedIn = true;
      act(() => h.spotify.setStatus(status));
      expect(screen.getByText(strings.spotify.status[status])).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: strings.player.retry })).not.toBeInTheDocument();
    },
  );

  it('does not show Spotify problems while a local song is current', () => {
    const { h } = setup(makeTrack('a'));
    act(() => h.spotify.setStatus('no-premium'));
    expect(screen.queryByText(strings.spotify.status['no-premium'])).not.toBeInTheDocument();
  });
});
