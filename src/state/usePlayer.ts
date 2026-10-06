import { createContext, createElement, use, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { PlayerProgress } from '../player/PlayerEngine';
import type { PlayerSnapshot, PlayerStore } from './PlayerStore';

const StoreContext = createContext<PlayerStore | null>(null);

export interface StoreProviderProps {
  store: PlayerStore;
  children?: ReactNode;
}

/** Makes the (externally created) store available to the tree. */
export function StoreProvider({ store, children }: StoreProviderProps) {
  return createElement(StoreContext, { value: store }, children);
}

/** The store, for calling actions. Reading state goes through the snapshot hooks. */
export function useStore(): PlayerStore {
  const store = use(StoreContext);
  if (store === null) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

const identity = (snapshot: PlayerSnapshot): PlayerSnapshot => snapshot;

/** Memoizes a selector result per snapshot so useSyncExternalStore sees stable values. */
class SelectorCache<T> {
  readonly #store: PlayerStore;
  readonly #selector: (snapshot: PlayerSnapshot) => T;
  readonly #isEqual: (a: T, b: T) => boolean;
  #snapshot: PlayerSnapshot | null = null;
  #entry: { readonly value: T } | null = null;

  constructor(
    store: PlayerStore,
    selector: (snapshot: PlayerSnapshot) => T,
    isEqual: (a: T, b: T) => boolean,
  ) {
    this.#store = store;
    this.#selector = selector;
    this.#isEqual = isEqual;
  }

  readonly read = (): T => {
    const snapshot = this.#store.getSnapshot();
    if (this.#entry !== null && snapshot === this.#snapshot) return this.#entry.value;
    const value = this.#selector(snapshot);
    this.#snapshot = snapshot;
    if (this.#entry !== null && this.#isEqual(this.#entry.value, value)) return this.#entry.value;
    this.#entry = { value };
    return value;
  };
}

/**
 * Subscribes to the store snapshot. With a selector the component only re-renders
 * when the selected value changes. The selector result is cached per snapshot, so
 * selectors that build a new object are safe as long as `isEqual` says they match.
 * Prefer module-level selectors: an inline one is re-evaluated on every render.
 */
export function usePlayerSnapshot<T = PlayerSnapshot>(
  selector: (snapshot: PlayerSnapshot) => T = identity as (snapshot: PlayerSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useStore();
  const cache = useMemo(
    () => new SelectorCache(store, selector, isEqual),
    [store, selector, isEqual],
  );
  return useSyncExternalStore(store.subscribe, cache.read, cache.read);
}

/** Live playback position. Only the progress bar should use this. */
export function useProgress(): PlayerProgress {
  const store = useStore();
  return useSyncExternalStore(store.subscribeProgress, store.getProgress, store.getProgress);
}
