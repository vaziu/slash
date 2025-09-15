// signals.ts
export interface Signal<T> {
  get(): T;
  set(v: T): void;
  subscribe(fn: (v: T) => void): () => void;
}

export function createSignal<T>(initial: T): Signal<T> {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set: (v) => {
      if (Object.is(v, value)) return;
      value = v;
      subs.forEach((fn) => fn(value));
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

// derivado simples (recalcula quando você “pinga” manualmente):
export function derived<T>(calc: () => T): Signal<T> {
  const s = createSignal(calc());
  // expõe set só para força externa (opcional)
  return {
    get: s.get,
    set: (v: T) => s.set(v),
    subscribe: s.subscribe,
  };
}

