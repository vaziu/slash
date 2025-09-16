// signals.ts
// Reatividade minimalista com tracking automático de dependências.

export interface Signal<T> {
  get(): T;
  set(v: T | ((prev: T) => T)): void;
  subscribe(fn: (v: T) => void): () => void;
}

export type ReadonlySignal<T> = Pick<Signal<T>, "get" | "subscribe">;

/* ------------------------------------------------------------------ */
/* microtask scheduler (DOM/Node/Bun-safe)                             */
/* ------------------------------------------------------------------ */
const scheduleMicrotask: (cb: () => void) => void =
  typeof queueMicrotask === "function"
    ? queueMicrotask
    : (cb) => Promise.resolve().then(cb);

/* ------------------------------------------------------------------ */
/* núcleo de tracking                                                  */
/* ------------------------------------------------------------------ */
type AnySignal = Signal<any>;

interface Computation {
  active: boolean;
  links: Map<AnySignal, () => void>; // signal -> unsubscribe
  cleanupFn?: () => void;
  scheduled: boolean;
  run(): void;
  schedule(): void;
}

let CURRENT: Computation | null = null;

function cleanup(comp: Computation) {
  for (const un of comp.links.values()) {
    try { un(); } catch {}
  }
  comp.links.clear();

  if (comp.cleanupFn) {
    const c = comp.cleanupFn;
    comp.cleanupFn = undefined;
    try { c(); } catch {}
  }
}

// Captura a computation ATUAL (no momento do get()) e usa essa referência no callback.
function track(sig: AnySignal) {
  const c = CURRENT;
  if (!c || !c.active) return;
  if (c.links.has(sig)) return;

  const unsub = sig.subscribe(() => {
    if (c.active) c.schedule();
  });

  c.links.set(sig, unsub);
}

/* ------------------------------------------------------------------ */
/* sinais                                                              */
/* ------------------------------------------------------------------ */

export function createSignal<T>(initial: T): Signal<T> {
  let value = initial;
  const subs = new Set<(v: T) => void>();

  const self: Signal<T> = {
    get: () => {
      track(self);
      return value;
    },
    set: (v) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(value) : v;
      if (Object.is(next, value)) return;
      value = next;
      subs.forEach((fn) => fn(value));
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };

  return self;
}

/**
 * Efeito colateral reativo.
 * Executa agora e a cada mudança de qualquer signal lido dentro do callback.
 * Pode retornar um cleanup; a função retornada por `effect` faz dispose total.
 */
export function effect(run: () => void | (() => void)): () => void {
  const comp: Computation = {
    active: true,
    links: new Map(),
    scheduled: false,
    run: () => {
      comp.scheduled = false;
      cleanup(comp);
      const prev = CURRENT;
      CURRENT = comp;
      try {
        const ret = run();
        if (typeof ret === "function") comp.cleanupFn = ret;
      } finally {
        CURRENT = prev;
      }
    },
    schedule: () => {
      if (comp.scheduled || !comp.active) return;
      comp.scheduled = true;
      scheduleMicrotask(() => {
        if (comp.active) comp.run();
      });
    },
  };

  comp.run();
  return () => {
    comp.active = false;
    cleanup(comp);
  };
}

/**
 * Valor derivado com cache. Atualiza quando as dependências mudam.
 * Implementado como Signal somente-leitura.
 */
export function computed<T>(calc: () => T): ReadonlySignal<T> {
  const out = createSignal<T>(undefined as unknown as T);
  let inited = false;

  const stop = effect(() => {
    const next = calc();
    if (!inited || !Object.is(out.get(), next)) {
      out.set(next);
      inited = true;
    }
    return undefined;
  });

  // opcional: expose dispose via símbolo/field se quiser
  void stop;

  return { get: out.get, subscribe: out.subscribe };
}

// alias (se quiser semântica diferente no futuro, separe)
export const memo = computed;

