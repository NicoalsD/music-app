/** Shallow equality for flat selector results (same keys, Object.is values). */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  const keysA = Object.keys(a) as (keyof T)[];
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => Object.is(a[key], b[key]));
}

/** `shallowEqual` for selector results that may be `null`. */
export function shallowEqualOrNull<T extends object>(a: T | null, b: T | null): boolean {
  if (a === null || b === null) return a === b;
  return shallowEqual(a, b);
}
