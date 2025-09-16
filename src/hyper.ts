// hyper.ts
import htm from 'htm';
import type { Signal } from './signals';


// htm + hyper (sem VDOM) com binds unidirecionais, eventos onX, class/style avançados.

/** Tipos de children aceitos no template literal */
type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | Signal<unknown>
  | Iterable<Child>;

type Props = Record<string, unknown> & { children?: Child[] };
export type Component<P = Record<string, unknown>> =
  (props: P & { children?: Child[] }) => Child;

const SVG_NS = "http://www.w3.org/2000/svg";

/** Bind do htm ao nosso hyper */
export const html = htm.bind(hyper);

/** Função "h" usada pelo htm */
export function hyper(
  type: string | Component,
  rawProps: Props | null,
  ...rawChildren: Child[]
): Node {
  const props: Props = rawProps ?? {};
  const children = flattenChildren(rawChildren);

  // Componente-função
  if (typeof type === "function") {
    return toNode(type({ ...props, children }));
  }

  // Elemento nativo
  const isSvg = type === "svg" || (props && props["isSvg"] === true);
  const el = isSvg
    ? document.createElementNS(SVG_NS, type as string)
    : document.createElement(type as string);

  // Atribuição de props
  for (const [key, val] of Object.entries(props)) {
    if (key === "children" || key === "isSvg") continue;

    // Eventos: onClick -> "click", onKeyUp -> "keyup"
    if (isEventProp(key) && typeof val === "function") {
      el.addEventListener(eventName(key), val as EventListener);
      continue;
    }

    // style: objeto/array/sinal
    if (key === "style") {
      if (isSignal(val)) {
        const s = val as Signal<unknown>;
        const apply = (v: unknown) => applyStyle(el as HTMLElement, v);
        apply(s.get()); s.subscribe(apply);
      } else {
        applyStyle(el as HTMLElement, val);
      }
      continue;
    }

    // class/className: string | string[] | Set<string> | Record<string,boolean> | Signal<...>
    if (key === "class" || key === "className") {
      if (isSignal(val)) {
        const s = val as Signal<unknown>;
        const apply = (v: unknown) => el.setAttribute("class", normalizeClass(v));
        apply(s.get()); s.subscribe(apply);
      } else {
        el.setAttribute("class", normalizeClass(val));
      }
      continue;
    }

    // Signal em prop -> atualiza propriedade/atributo quando mudar
    if (isSignal(val)) {
      bindSignalToProp(el, key, val as Signal<unknown>);
      continue;
    }

    // Booleanos viram atributos booleanos
    if (typeof val === "boolean") {
      if (val) el.setAttribute(key, "");
      else el.removeAttribute(key);
      continue;
    }

    // Fallback: propriedade se existir; senão atributo
    if (key in (el as any)) {
      (el as any)[key] = val as any;
    } else {
      el.setAttribute(key, String(val));
    }
  }

  // Children
  for (const child of children) appendChild(el, child);

  return el;
}

/** Montagem raiz (uma vez) — diffs vêm dos sinais ligados aos nós */
export function render(target: Element, tree: Child): void {
  target.replaceChildren(toNode(tree));
}

/* ===================== Helpers ===================== */

function isSignal(x: unknown): x is Signal<unknown> {
  return !!x && typeof x === "object"
    && "get" in (x as Record<string, unknown>)
    && "set" in (x as Record<string, unknown>);
}

type MaybeIterable = { [Symbol.iterator]?: () => Iterator<unknown> };

function isIterable(x: unknown): x is Iterable<unknown> {
  return x != null
    && typeof x === "object"
    && typeof (x as MaybeIterable)[Symbol.iterator] === "function";
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && Object.getPrototypeOf(x) === Object.prototype;
}

function isEventProp(k: string) {
  return /^on[A-Z]/.test(k);
}
function eventName(k: string) {
  return k.slice(2).toLowerCase(); // onClick -> "click"
}

/** class: aceita string | string[] | Set<string> | Record<string, boolean> | Signal<...> */
function normalizeClass(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.filter(Boolean).map(String).join(" ");
  if (v instanceof Set) return Array.from(v).map(String).join(" ");
  if (isPlainObject(v)) {
    const out: string[] = [];
    for (const [k, on] of Object.entries(v)) if (on) out.push(k);
    return out.join(" ");
  }
  return String(v);
}

/** style: aceita objeto, array de objetos, ou Signal disso. Números viram "px". */
function applyStyle(node: HTMLElement, v: unknown) {
  const styles: Record<string, string | number> =
    Array.isArray(v)
      ? Object.assign({}, ...(v as Array<Record<string, string | number>>))
      : (isPlainObject(v) ? (v as Record<string, string | number>) : {});

  for (const [k, val] of Object.entries(styles)) {
    const cssVal = typeof val === "number" ? `${val}px` : String(val);
    node.style.setProperty(k, cssVal);
  }
}

/** Prop reativa (Signal em prop) */
function bindSignalToProp(el: Element, key: string, sig: Signal<unknown>) {
  const apply = (v: unknown) => {
    if (key === "textContent") {
      el.textContent = v == null ? "" : String(v);
      return;
    }
    if (key === "class" || key === "className") {
      el.setAttribute("class", normalizeClass(v));
      return;
    }
    if (key in (el as any)) {
      (el as any)[key] = v as any;
    } else {
      if (v == null) el.removeAttribute(key);
      else el.setAttribute(key, String(v));
    }
  };
  apply(sig.get());
  sig.subscribe(apply);
}

/** Append de filhos: suporta Signal em children (TextNode reativo) */
function appendChild(parent: Element, child: Child) {
  if (child == null || child === false) return;

  if (isSignal(child)) {
    const text = document.createTextNode("");
    parent.appendChild(text);
    const s = child as Signal<unknown>;
    const apply = (v: unknown) => { text.data = v == null ? "" : String(v); };
    apply(s.get()); s.subscribe(apply);
    return;
  }

  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }

  if (isIterable(child)) {
    for (const c of child as Iterable<Child>) appendChild(parent, c);
    return;
  }

  parent.appendChild(document.createTextNode(String(child)));
}

/** Converte qualquer Child em Node (para render inicial) */
function toNode(x: Child): Node {
  if (x instanceof Node) return x;
  if (isSignal(x)) {
    const t = document.createTextNode("");
    const s = x as Signal<unknown>;
    t.data = s.get() == null ? "" : String(s.get());
    s.subscribe((v) => { t.data = v == null ? "" : String(v); });
    return t;
  }
  if (isIterable(x)) {
    const frag = document.createDocumentFragment();
    for (const c of x as Iterable<Child>) frag.appendChild(toNode(c));
    return frag;
  }
  return document.createTextNode(String(x ?? ""));
}

/** Achata filhos (evita erro "Cannot find name 'flat'") */
function flattenChildren(list: Child[]): Child[] {
  const out: Child[] = [];
  (function rec(a: Child[]) {
    for (const x of a) {
      if (x == null || x === false) continue;
      if (isIterable(x) && !(x instanceof Node)) rec(Array.from(x as Iterable<Child>) as Child[]);
      else out.push(x);
    }
  })(list);
  return out;
}

