// packages/slash/src/components.ts

// Reatividade
export { createSignal, effect, computed, memo } from "./signals";
export type { Signal, ReadonlySignal } from "./signals";

// Renderer + utilitários do hyper (com reatividade embutida)
export { html, h, render, Repeat, destroyNode } from "./hyper";

import { computed, type Signal, type ReadonlySignal } from "./signals";

/* ------------------------------------------------------------------ */
/* Helpers de DX                                                       */
/* ------------------------------------------------------------------ */

type SignalLike<T = unknown> = ReadonlySignal<T> | Signal<T>;
function isSignalLike<T = unknown>(x: unknown): x is SignalLike<T> {
  return !!x && typeof (x as any).get === "function" && typeof (x as any).subscribe === "function";
}

/**
 * modelText — two-way bind para <input type="text"> / <textarea>
 * Uso:
 *   const name = createSignal("");
 *   html`<input ${modelText(name)} />`
 */
export function modelText(sig: Signal<string>) {
  return {
    value: sig,
    onInput: (e: Event) => {
      const t = e.currentTarget as HTMLInputElement | HTMLTextAreaElement;
      sig.set(t.value);
    },
  };
}

/**
 * modelChecked — two-way bind para <input type="checkbox">
 * Uso:
 *   const done = createSignal(false);
 *   html`<input type="checkbox" ${modelChecked(done)} />`
 */
export function modelChecked(sig: Signal<boolean>) {
  return {
    checked: sig,
    onChange: (e: Event) => {
      const t = e.currentTarget as HTMLInputElement;
      sig.set(!!t.checked);
    },
  };
}

/**
 * modelSelect — two-way bind para <select>
 * Uso:
 *   const color = createSignal("red");
 *   html`<select ${modelSelect(color)}><option value="red">red</option>...</select>`
 */
export function modelSelect(sig: Signal<string>) {
  return {
    value: sig,
    onChange: (e: Event) => {
      const t = e.currentTarget as HTMLSelectElement;
      sig.set(t.value);
    },
  };
}

/**
 * toggleClass — liga/desliga uma classe (string) com boolean ou Signal<boolean>.
 * Retorna algo aplicável em `class=...` do hyper (que aceita string/objeto/sinal).
 *
 *   html`<div class=${toggleClass(styles.todo, isActive)}></div>`
 */
export function toggleClass(name: string, on: boolean | SignalLike<boolean>) {
  if (typeof on === "boolean") {
    return { [name]: on };
  }
  // reativo: objeto reavaliado quando o sinal mudar
  return computed(() => ({ [name]: !!on.get() }));
}

/**
 * cx — junta classes (strings, objetos, arrays) e aceita sinais desses formatos.
 * Se algum argumento for sinal, retorna um ReadonlySignal<string>, senão uma string.
 *
 *   class=${cx(styles.row, { [styles.active]: isActive }, otherSignal)}
 */
export function cx(...parts: unknown[]) {
  const flat = flatten(parts);

  const hasSignal = flat.some((p) => isSignalLike(p));
  const buildOnce = (): string => joinClasses(flat);

  return hasSignal ? computed(buildOnce) : buildOnce();
}

/* ------------------------------------------------------------------ */
/* utils internos                                                      */
/* ------------------------------------------------------------------ */

// flatten leve (sem usar any)
function flatten(xs: unknown[], out: unknown[] = []): unknown[] {
  for (const x of xs) {
    if (Array.isArray(x)) flatten(x, out);
    else out.push(x);
  }
  return out;
}

function joinClasses(xs: unknown[]): string {
  const acc: string[] = [];

  for (const x of xs) {
    if (!x) continue;

    // sinal -> pega o valor atual e processa recursivamente (apenas 1 nível)
    if (isSignalLike(x)) {
      const v = x.get();
      if (typeof v === "string") { acc.push(v); continue; }
      if (Array.isArray(v)) { acc.push(joinClasses(v)); continue; }
      if (v && typeof v === "object") {
        for (const [k, on] of Object.entries(v)) if (on) acc.push(k);
        continue;
      }
      continue;
    }

    if (typeof x === "string") { acc.push(x); continue; }
    if (Array.isArray(x)) { acc.push(joinClasses(x)); continue; }

    if (typeof x === "object") {
      for (const [k, on] of Object.entries(x as Record<string, unknown>)) {
        if (on) acc.push(k);
      }
      continue;
    }
  }

  return acc.filter(Boolean).join(" ");
}

