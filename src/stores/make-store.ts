import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Zustand store factory — the professional replacement for the ~70-hook
// useState soup that used to live in app-root.tsx.
//
// Every store is built from a plain initial-state object; for each data key a
// matching `set<Key>` action is generated whose signature is EXACTLY
// React's Dispatch<SetStateAction<T>>:
//
//   type Upd<V> = V | ((prev: V) => T)
//
// so every pre-existing `setX(value)` / `setX(prev => next)` call site keeps
// compiling and behaving identically (functional updaters read the freshest
// store value — they can no longer go stale, which kills a whole class of
// closure bugs the mirror-refs used to paper over).
// ---------------------------------------------------------------------------

export type Upd<V> = V | ((prev: V) => V);

export type Setters<D extends object> = {
  [K in keyof D as `set${Capitalize<string & K>}`]: (v: Upd<D[K]>) => void;
};

export function makeSetters<D extends object>(
  set: (partial: Partial<D> | ((s: D) => Partial<D>)) => void,
  keys: readonly (keyof D & string)[]
): Setters<D> {
  const out = {} as Record<string, unknown>;
  for (const k of keys) {
    out[`set${k.charAt(0).toUpperCase()}${k.slice(1)}`] = (v: Upd<unknown>) =>
      set(s => ({ [k]: typeof v === 'function' ? (v as (p: unknown) => unknown)(s[k]) : v }) as Partial<D>);
  }
  return out as Setters<D>;
}

/**
 * Build a typed Zustand store from an initial-state object.
 * The returned hook is used with fine-grained selectors:
 *
 *   const loading = useSessionStore(s => s.loading);
 *   const setLoading = useSessionStore(s => s.setLoading);
 */
export function makeStore<D extends object>(initial: D) {
  return create<D & Setters<D>>(set => ({
    ...initial,
    // Zustand's `set` accepts Partial<full-state> — for the generated setters
    // it only ever receives Partial<D> data keys, the cast keeps the factory
    // generic while each store's public type stays fully typed.
    ...makeSetters(set as unknown as (partial: Partial<D> | ((s: D) => Partial<D>)) => void, Object.keys(initial) as (keyof D & string)[]),
  }));
}
