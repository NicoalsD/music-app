import { useCallback, useState } from 'react';

/** What the main area of the shell shows. Album and artist details sit on top of a root view. */
export type MainView =
  | { readonly kind: 'home' }
  | { readonly kind: 'search' }
  | { readonly kind: 'playlist' }
  | { readonly kind: 'album'; readonly id: string }
  | { readonly kind: 'artist'; readonly id: string };

export type RootView = Extract<MainView, { kind: 'home' | 'search' | 'playlist' }>;

export interface MainNavigation {
  readonly view: MainView;
  readonly canGoBack: boolean;
  /** Shows a root view and drops any detail stack. */
  goTo: (next: RootView) => void;
  /** Opens an album or artist detail on top of the current view. */
  push: (next: MainView) => void;
  back: () => void;
}

const HOME: MainView = { kind: 'home' };

/** The shell's view stack. Details push, roots reset, back pops. No router library. */
export function useMainNavigation(): MainNavigation {
  const [stack, setStack] = useState<readonly MainView[]>([HOME]);

  const goTo = useCallback((next: RootView) => {
    setStack((current) => {
      const only = current[0];
      return current.length === 1 && only !== undefined && only.kind === next.kind
        ? current
        : [next];
    });
  }, []);
  const push = useCallback((next: MainView) => setStack((current) => [...current, next]), []);
  const back = useCallback(
    () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)),
    [],
  );

  return { view: stack.at(-1) ?? HOME, canGoBack: stack.length > 1, goTo, push, back };
}
