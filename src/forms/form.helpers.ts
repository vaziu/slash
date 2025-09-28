// packages/slash/src/forms/form.helpers.ts
import { computed } from "../signals";
import type { ReadonlySignal, Signal } from "../types";
import type {
  FormEvent,
  TextFieldEvent, TextFieldElement,
  CheckboxEvent,  CheckboxElement,
  RadioEvent,     RadioElement,
  SelectEvent,    SelectElement,
  ButtonEvent,
  FormSubmitEvent,
  FormElement,
  TextFieldControlMode
} from "./form.types";

/* ----------------------------------------------------------------------------
 * Two-way bindings (models)
 * -------------------------------------------------------------------------- */

/** Text input / textarea */
export function textFieldControl(sig: Signal<string>, mode: TextFieldControlMode = "input") {
  const base = { value: sig } as Record<string, unknown>;
  if (mode === "input" || mode === "both") {
    base.onInput = (e: TextFieldEvent<InputEvent>) => sig.set(e.target.value);
  }
  if (mode === "change" || mode === "both") {
    base.onChange = (e: TextFieldEvent<Event>) => sig.set(e.target.value);
  }
  return base;
}

/** Checkbox (boolean) */
export function checkboxControl(sig: Signal<boolean>) {
  return {
    checked: sig,
    onChange: (e: CheckboxEvent<Event>) => {
      sig.set((e.target as CheckboxElement).checked);
    },
  };
}

/** Radio group (valor selecionado). Passe o value desta opção. */
export function radioControl(groupValue: Signal<string>, value: string) {
  return {
    checked: computed<boolean>(() => groupValue.get() === value) as ReadonlySignal<boolean>,
    onChange: (e: RadioEvent<Event>) => {
      if ((e.target as RadioElement).checked) {
        groupValue.set(value);
      }
    },
    value,
  };
}

/** Select (single) */
export function SelectControl(sig: Signal<string>) {
  return {
    value: sig,
    onChange: (e: SelectEvent<Event>) => {
      sig.set((e.target as SelectElement).value);
    },
    onInput: (e: SelectEvent<InputEvent>) => {
      sig.set((e.target as SelectElement).value);
    },
  };
}

/* ----------------------------------------------------------------------------
 * Helpers de leitura de valor (DX)
 * -------------------------------------------------------------------------- */

export const getText = (e: TextFieldEvent): string => e.target.value;
export const getChecked = (e: CheckboxEvent | RadioEvent): boolean =>
  (e.target as CheckboxElement | RadioElement).checked;
export const getSelectValue = (e: SelectEvent): string => e.target.value;

/* ----------------------------------------------------------------------------
 * Delegation de eventos (leve e tipado)
 * -------------------------------------------------------------------------- */

/**
 * Delegation: escuta em `root`, encaminha para o elemento mais próximo que
 * corresponda ao `selector`. O handler recebe um FormEvent com target tipado.
 *
 * Uso:
 *   const off = delegate<HTMLInputElement, InputEvent>(
 *     formEl, "input", 'input[name="email"]',
 *     (e) => console.log(e.target.value)
 *   );
 *   // off() remove o listener
 */
export function delegate<El extends Element, Evt extends Event = Event>(
  root: Element,
  type: string,
  selector: string,
  handler: (e: FormEvent<El, Evt>) => void,
  options?: boolean | AddEventListenerOptions
): () => void {
  const listener = (ev: Event) => {
    const start = ev.target as Element | null;
    if (!start) return;
    const target = start.closest(selector) as El | null;
    if (!target || !root.contains(target)) return;

    // “Projeta” o evento original com target tipado
    const wrapped = Object.assign(Object.create(Object.getPrototypeOf(ev)), ev, {
      target,
      currentTarget: target,
    }) as FormEvent<El, Evt>;

    handler(wrapped);
  };

  root.addEventListener(type, listener as EventListener, options);
  return () => root.removeEventListener(type, listener as EventListener, options);
}

/* ----------------------------------------------------------------------------
 * Form data helpers
 * -------------------------------------------------------------------------- */

/** Converte um <form> em objeto plano. Campos duplicados viram arrays (sem undefined). */
export function formToObject(
  form: FormElement
): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const fd = new FormData(form);
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};

  fd.forEach((value, key) => {
    const existing = out[key];
    if (existing === undefined) {
      out[key] = value;
    } else if (Array.isArray(existing)) {
      (existing as FormDataEntryValue[]).push(value);
    } else {
      out[key] = [existing, value];
    }
  });

  return out;
}

/**
 * onSubmit: previne default, entrega `data` (objeto) e evento tipado.
 *
 * Uso:
 *   html`<form onSubmit=${onSubmit((data) => { ... })}>...</form>`
 */
export function onSubmit(
  cb: (data: Record<string, FormDataEntryValue | FormDataEntryValue[]>, e: FormSubmitEvent) => void
) {
  return (e: FormSubmitEvent) => {
    e.preventDefault();
    cb(formToObject(e.currentTarget), e);
  };
}

/* ----------------------------------------------------------------------------
 * Botões utilitários (opcional)
 * -------------------------------------------------------------------------- */

export function onReset(handler: (e: FormEvent<FormElement, Event>) => void) {
  return (e: FormEvent<FormElement, Event>) => handler(e);
}

export function onButtonClick(handler: (e: ButtonEvent<MouseEvent>) => void) {
  return (e: ButtonEvent<MouseEvent>) => handler(e);
}

