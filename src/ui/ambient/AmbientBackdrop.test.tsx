import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTheme } from '../palette/palette';

const state = vi.hoisted(() => ({ reduce: false, webgl: true, sceneLoads: 0 }));

vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => state.reduce,
}));
vi.mock('./webgl', () => ({ canUseWebGl: () => state.webgl }));
vi.mock('./AmbientScene', () => {
  state.sceneLoads += 1;
  return { default: () => <div data-testid="scene" /> };
});

import { AmbientBackdrop } from './AmbientBackdrop';

const theme = buildTheme(null);

describe('AmbientBackdrop', () => {
  beforeEach(() => {
    state.reduce = false;
    state.webgl = true;
  });

  it('renders nothing under reduced motion and never loads the scene', () => {
    state.reduce = true;
    render(<AmbientBackdrop theme={theme} playing />);
    expect(screen.queryByTestId('ambient-backdrop')).toBeNull();
    expect(state.sceneLoads).toBe(0);
  });

  it('renders nothing without WebGL and never loads the scene', () => {
    state.webgl = false;
    render(<AmbientBackdrop theme={theme} playing />);
    expect(screen.queryByTestId('ambient-backdrop')).toBeNull();
    expect(state.sceneLoads).toBe(0);
  });

  it('lazy-loads a hidden, input-transparent scene when supported', async () => {
    render(<AmbientBackdrop theme={theme} playing={false} />);
    expect(screen.getByTestId('ambient-backdrop')).toHaveAttribute('aria-hidden', 'true');
    expect(await screen.findByTestId('scene')).toBeInTheDocument();
    expect(state.sceneLoads).toBe(1);
  });
});
