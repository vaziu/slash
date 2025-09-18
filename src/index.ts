// src/index.ts
export { html, h, render, Repeat, destroyNode } from "./hyper";
export { createSignal, effect, computed, memo } from "./signals";
export * from "./components";

// Reexporte TIPOS num único lugar (DX + sem ciclos)
export type {
  Key, Elementish, Child, Props,
  EventOptions, EventHandler, EventTuple,
  HTMTemplate, HTMModule,
  Signal, ReadonlySignal, SignalArray, ReadonlySignalArray,
  Renderer
} from "./types";



