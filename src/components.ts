// packages/slash/src/components.ts
import type { Signal, ReadonlySignal } from "./types";
import { computed } from "./signals"

/* ------------------------------------------------------------------ */
/* Helpers de DX                                                       */
/* ------------------------------------------------------------------ */

type SignalLike<T = unknown> = ReadonlySignal<T> | Signal<T>;
function isSignalLike<T = unknown>(x: unknown): x is SignalLike<T> {
  return !!x && typeof (x as any).get === "function" && typeof (x as any).subscribe === "function";
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

