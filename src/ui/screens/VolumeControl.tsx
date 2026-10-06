import * as Slider from '@radix-ui/react-slider';
import { Volume2, VolumeX } from 'lucide-react';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { IconButton } from '../components/IconButton';
import { strings } from '../i18n/es';
import { shallowEqual } from './shallowEqual';
import styles from './VolumeControl.module.css';

const selectVolume = (s: PlayerSnapshot) => ({ volume: s.player.volume, muted: s.player.muted });

/** Volume slider (arrows move 5 %) and the mute toggle, which remembers the previous level. */
export function VolumeControl({ className }: { className?: string | undefined }) {
  const store = useStore();
  const { volume, muted } = usePlayerSnapshot(selectVolume, shallowEqual);
  const percent = muted ? 0 : Math.round(volume * 100);

  return (
    <div className={`${styles.root} ${className ?? ''}`}>
      <IconButton
        label={muted ? strings.player.unmute : strings.player.mute}
        pressed={muted}
        icon={
          muted ? <VolumeX size={20} strokeWidth={1.5} /> : <Volume2 size={20} strokeWidth={1.5} />
        }
        onClick={() => store.toggleMute()}
      />
      <Slider.Root
        className={styles.slider}
        min={0}
        max={100}
        step={5}
        value={[percent]}
        onValueChange={([next]) => {
          if (next !== undefined) store.setVolume(next / 100);
        }}
      >
        <Slider.Track className={styles.track}>
          <Slider.Range className={styles.range} />
        </Slider.Track>
        <Slider.Thumb
          className={styles.thumb}
          aria-label={strings.player.volume}
          aria-valuetext={strings.player.volumeValue(percent)}
        />
      </Slider.Root>
    </div>
  );
}
