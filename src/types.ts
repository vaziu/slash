// src/types.ts
export type Key = string | number | symbol;

export type Elementish = HTMLElement | SVGElement;

export type Signal<T> = {
  get(): T;
  set(v: T | ((prev: T) => T)): void;
  subscribe(fn: (v: T) => void): () => void;
};

export interface SignalArray<T> extends Signal<T[]> {
  map(render: Renderer<T>): Node; // “map reativo” (Repeat por baixo)
}

export type ReadonlySignal<T> = Pick<Signal<T>, "get" | "subscribe">;
export type ReadonlySignalArray<T> = Pick<SignalArray<T>, "get" | "subscribe" | "map">;
export type SignalLike<T = unknown> = ReadonlySignal<T> | Signal<T>;

export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlySignal<unknown>
  | Child[]
  | readonly Child[];

export type Props = Record<string, unknown> | null;

export type EventOptions = boolean | AddEventListenerOptions;
export type EventHandler = EventListenerOrEventListenerObject;
export type EventTuple = readonly [EventHandler, EventOptions?];

export type Renderer<T> = (item: T, index: number) => Child;

// HTM
export type HTMTemplate = (strings: TemplateStringsArray, ...values: unknown[]) => Child;
export type HTMModule = {
  bind(
    h: (tag: unknown, props: Props, ...children: Child[]) => Node
  ): HTMTemplate;
};

// Abstração para renderer de listas (injeção)
export type ListRenderer = <T>(
  list: ReadonlySignal<T[]>,
  keyOf: (item: T) => Key,
  render: (item: T) => Child
) => Node;

