/** Shallow equality for flat selector results (same keys, Object.is values). */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  const keysA = Object.keys(a) as (keyof T)[];
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => Object.is(a[key], b[key]));
}
