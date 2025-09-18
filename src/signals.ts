// src/signals.ts
import type {
  Signal, ReadonlySignal, ReadonlySignalArray, SignalArray,
  ListRenderer, Key
} from "./types";

/* microtask scheduler */
const scheduleMicrotask: (cb: () => void) => void =
  typeof queueMicrotask === "function" ? queueMicrotask : (cb) => Promise.resolve().then(cb);

/* tracking */
type AnySignal = Signal<unknown>;
interface Computation {
  active: boolean;
  links: Map<AnySignal, () => void>;
  cleanupFn?: () => void;
  scheduled: boolean;
  run(): void;
  schedule(): void;
}
let CURRENT: Computation | null = null;

function cleanup(comp: Computation) {
  for (const un of comp.links.values()) { try { un(); } catch {} }
  comp.links.clear();
  if (comp.cleanupFn) { const c = comp.cleanupFn; comp.cleanupFn = undefined; try { c(); } catch {} }
}
function track(sig: AnySignal) {
  const c = CURRENT;
  if (!c || !c.active || c.links.has(sig)) return;
  const unsub = (sig as Signal<unknown>).subscribe(() => { if (c.active) c.schedule(); });
  c.links.set(sig, unsub);
}

/* ---- DI do renderer de listas (sem import de hyper) ---- */
let LIST_RENDERER: ListRenderer | null = null;
export function setListRendererImpl(fn: ListRenderer): void {
  LIST_RENDERER = fn;
}

// ✅ helper: remove o .set, mantém get/subscribe/map
export function asReadonlyList<T>(s: SignalArray<T>): ReadonlySignalArray<T> {
  return { get: s.get, subscribe: s.subscribe, map: s.map };
}

/* ---- sinais ---- */
export function createSignal<T>(initial: T[]): SignalArray<T>;
export function createSignal<T>(initial: T): Signal<T>;
export function createSignal<T>(initial: T | T[]): Signal<T> | SignalArray<T> {
  let value = initial as T;
  const subs = new Set<(v: T) => void>();

  const self: Signal<T> = {
    get: () => { track(self as unknown as AnySignal); return value; },
    set: (v) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(value) : v;
      if (Object.is(next, value)) return;
      value = next;
      subs.forEach((fn) => fn(value));
    },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };

  if (Array.isArray(initial)) {
    // Heurística de chave: id/key -> WeakMap identidade -> primitivo
    const objKeys = new WeakMap<object, Key>();
    const primSeen = new Map<string, number>();
    const keyOf = (item: unknown): Key => {
      if (item !== null && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        if ("id" in rec) return rec.id as Key;
        if ("key" in rec) return rec.key as Key;
        const o = item as object;
        const ex = objKeys.get(o);
        if (ex !== undefined) return ex;
        const sym = Symbol("item");
        objKeys.set(o, sym);
        return sym;
      }
      const k = `${typeof item}:${String(item)}`;
      if (process.env.NODE_ENV !== "production") {
        const n = (primSeen.get(k) ?? 0) + 1;
        primSeen.set(k, n);
        if (n > 1) console.warn("[slash] map(): duplicated primitive key", item);
      }
      return k;
    };

    const listSelf = self as unknown as SignalArray<unknown>;
    listSelf.map = (render) => {
      if (!LIST_RENDERER) {
        throw new Error("[slash] list renderer not registered — ensure `hyper` is imported before using listSignal.map()");
      }
      const sigArr = self as unknown as Signal<unknown[]>;
      return LIST_RENDERER(sigArr, keyOf as (x: unknown) => Key, (item) => {
        const arr = sigArr.get();
        const idx = arr.indexOf(item);
        return render(item, idx);
      });
    };
    return listSelf as unknown as SignalArray<T>;
  }

  return self;
}

export function effect(run: () => void | (() => void)): () => void {
  const comp: Computation = {
    active: true, links: new Map(), scheduled: false,
    run: () => {
      comp.scheduled = false;
      cleanup(comp);
      const prev = CURRENT; CURRENT = comp;
      try {
        const ret = run(); if (typeof ret === "function") comp.cleanupFn = ret;
      } finally { CURRENT = prev; }
    },
    schedule: () => {
      if (comp.scheduled || !comp.active) return;
      comp.scheduled = true;
      scheduleMicrotask(() => { if (comp.active) comp.run(); });
    },
  };
  comp.run();
  return () => { comp.active = false; cleanup(comp); };
}

export function computed<T>(calc: () => T): ReadonlySignal<T> {
  const out = createSignal<T>(undefined as unknown as T);
  let inited = false;
  const stop = effect(() => {
    const next = calc();
    if (!inited || !Object.is(out.get(), next)) { out.set(next); inited = true; }
  });
  void stop;
  return { get: out.get, subscribe: out.subscribe };
}
export const memo = computed;

