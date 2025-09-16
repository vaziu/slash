import htm from "htm";
import type { ReadonlySignal, Signal } from "./signals";

/* -------------------------------------------------------------
 * Tipos e utilitários
 * ----------------------------------------------------------- */

type SignalLike<T = unknown> = {
  get(): T;
  subscribe(fn: (v: T) => void): () => void;
};

function isSignalLike(x: unknown): x is SignalLike {
  return (
    !!x &&
    typeof (x as Record<string, unknown>).get === "function" &&
    typeof (x as Record<string, unknown>).subscribe === "function"
  );
}

type Elementish = HTMLElement | SVGElement;

type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | SignalLike
  | Child[]
  | readonly Child[];

type Props = Record<string, unknown> | null;

// Eventos (sem any / sem null)
type EventOptions = boolean | AddEventListenerOptions;
type EventHandler = EventListenerOrEventListenerObject;
type EventTuple = readonly [EventHandler, EventOptions?];

// Tipos para o HTM
type HTMTemplate = (strings: TemplateStringsArray, ...values: unknown[]) => Child;
type HTMModule = {
  bind(h: (tag: unknown, props: Props, ...children: Child[]) => Node): HTMTemplate;
};

function toStr(v: unknown): string {
  return v == null ? "" : typeof v === "string" ? v : String(v);
}

/* -------------------------------------------------------------
 * Cleanups por nó (lifecycle básico)
 * ----------------------------------------------------------- */

const CLEANUPS = new WeakMap<Node, Array<() => void>>();

function addCleanup(node: Node, fn: () => void): void {
  const arr = CLEANUPS.get(node);
  if (arr) arr.push(fn);
  else CLEANUPS.set(node, [fn]);
}

export function destroyNode(node: Node): void {
  const fns = CLEANUPS.get(node);
  if (fns) {
    for (const f of fns) {
      try {
        f();
      } catch {}
    }
    CLEANUPS.delete(node);
  }
  if (node instanceof Element && node.hasChildNodes()) {
    node.childNodes.forEach((child) => destroyNode(child));
  }
}

/* -------------------------------------------------------------
 * Children com reatividade (interpolações)
 * ----------------------------------------------------------- */

function appendReactiveText(parent: Node, sig: SignalLike<unknown>): void {
  const tn = document.createTextNode(toStr(sig.get()));
  const unsub = sig.subscribe((v) => {
    tn.nodeValue = toStr(v);
  });
  addCleanup(tn, unsub);
  parent.appendChild(tn);
}

function appendChildSmart(parent: Node, child: Child): void {
  if (child == null || child === false) return;

  if (isSignalLike(child)) {
    appendReactiveText(parent, child);
    return;
  }

  if (Array.isArray(child)) {
    for (const c of child) appendChildSmart(parent, c as Child);
    return;
  }

  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }

  parent.appendChild(document.createTextNode(toStr(child)));
}

/* -------------------------------------------------------------
 * Props/attrs/eventos (com suporte reativo)
 * ----------------------------------------------------------- */

function applyClass(el: HTMLElement, v: unknown): void {
  if (v == null || v === false) {
    el.className = "";
    return;
  }
  if (typeof v === "string") {
    el.className = v;
    return;
  }
  if (Array.isArray(v)) {
    el.className = v.filter(Boolean).map((x) => String(x)).join(" ");
    return;
  }
  if (typeof v === "object") {
    const list = Object.entries(v as Record<string, unknown>)
      .filter(([, on]) => Boolean(on))
      .map(([k]) => k);
    el.className = list.join(" ");
    return;
  }
  el.className = String(v);
}

/* ==== Guards de evento (seguros) ==== */

function isEventHandler(x: unknown): x is EventHandler {
  return (
    typeof x === "function" ||
    (typeof x === "object" && x !== null && "handleEvent" in (x as Record<string, unknown>))
  );
}

function isEventOptions(x: unknown): x is EventOptions {
  return typeof x === "boolean" || (typeof x === "object" && x !== null);
}

function isEventTuple(x: unknown): x is EventTuple {
  if (!Array.isArray(x)) return false;
  if (x.length === 0) return false;
  const fn0: unknown = x[0];
  if (!isEventHandler(fn0)) return false;
  const maybeOpts: unknown = x.length > 1 ? x[1] : undefined;
  if (maybeOpts !== undefined && !isEventOptions(maybeOpts)) return false;
  return true;
}

function parseEventProp(x: unknown): { handler: EventHandler; options?: EventOptions } | null {
  if (isEventHandler(x)) {
    return { handler: x };
  }
  if (isEventTuple(x)) {
    const handler = x[0];
    const options = x.length > 1 ? x[1] : undefined;
    return { handler, options };
    }
  return null;
}

/* ==== setEvent com assinatura única ==== */
function setEvent(el: Element, type: string, handler: EventHandler, opts?: EventOptions): void {
  el.addEventListener(type, handler, opts);
  addCleanup(el, () => el.removeEventListener(type, handler, opts));
}

/* ==== props reativas ==== */
function setPropReactive(el: Elementish, key: string, sig: SignalLike<unknown>): void {
  const apply = (v: unknown): void => {
    if (key === "class" || key === "className") {
      applyClass(el as HTMLElement, v);
      return;
    }
    if (key === "style" && v && typeof v === "object") {
      Object.assign((el as HTMLElement).style, v as Record<string, unknown>);
      return;
    }

    if (key in el) {
      const ok = Reflect.set(el as object, key, v);
      if (!ok) {
        if (v == null || v === false) el.removeAttribute(key);
        else el.setAttribute(key, String(v));
      }
    } else {
      if (v == null || v === false) el.removeAttribute(key);
      else el.setAttribute(key, String(v));
    }
  };

  apply(sig.get());
  const unsub = sig.subscribe(apply);
  addCleanup(el, unsub);
}

/* ==== setProp com branch de evento limpo ==== */
function setProp(el: Elementish, key: string, val: unknown): void {
  if (key === "children") return;

  // eventos: onClick, onInput, ...
  if (key.startsWith("on") && key[2] === key[2]?.toUpperCase()) {
    const type = key.slice(2).toLowerCase();
    const parsed = parseEventProp(val);
    if (parsed) setEvent(el, type, parsed.handler, parsed.options);
    return;
  }

  if (isSignalLike(val)) {
    setPropReactive(el, key, val);
    return;
  }

  if (key === "style" && val && typeof val === "object") {
    Object.assign((el as HTMLElement).style, val as Record<string, unknown>);
    return;
  }

  if (key === "class" || key === "className") {
    applyClass(el as HTMLElement, val);
    return;
  }

  if (key in el) {
    const ok = Reflect.set(el as object, key, val);
    if (!ok) {
      if (val == null || val === false) el.removeAttribute(key);
      else el.setAttribute(key, String(val));
    }
  } else {
    if (val == null || val === false) el.removeAttribute(key);
    else el.setAttribute(key, String(val));
  }
}

/* -------------------------------------------------------------
 * h() + html (HTM)
 * ----------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set<string>([
  "svg",
  "path",
  "g",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "defs",
  "use",
  "clipPath",
  "mask",
  "pattern",
  "text",
]);

export function h(tag: unknown, props: Props, ...children: Child[]): Node {
  // Componente (função) — pode retornar qualquer Child; empacotar se não for Node
  if (typeof tag === "function") {
    const out = (tag as (p: Record<string, unknown>) => Node | Child)({
      ...(props || {}),
      children,
    });
    if (out instanceof Node) return out;
    const frag = document.createDocumentFragment();
    appendChildSmart(frag, out as Child);
    return frag;
  }

  // Tag nativa
  const tagName = String(tag || "div");
  const el = (SVG_TAGS.has(tagName)
    ? document.createElementNS(SVG_NS, tagName)
    : document.createElement(tagName)) as Elementish;

  if (props) {
    for (const [k, v] of Object.entries(props)) setProp(el, k, v);
  }
  for (const ch of children) appendChildSmart(el, ch);
  return el;
}

export const html: HTMTemplate = (htm as unknown as HTMModule).bind(h);

/* -------------------------------------------------------------
 * render: aceita qualquer Child ou função que retorne Child
 * ----------------------------------------------------------- */

type RootView = Child | (() => Child);

export function render(view: RootView, container: Element): Node | Node[] {
  // cleanup de filhos anteriores
  const prevNodes = Array.from(container.childNodes) as Node[];
  for (const node of prevNodes) destroyNode(node);
  container.textContent = "";

  // resolve view
  const out = typeof view === "function" ? (view as () => Child)() : view;
  const parts = Array.isArray(out) ? out : [out];

  for (const p of parts) appendChildSmart(container, p);

  const inserted = Array.from(container.childNodes) as Node[];
  return inserted.length === 1 ? inserted[0]! : inserted;
}

/* -------------------------------------------------------------
 * Repeat: keyed diff com blocos movíveis (suporta múltiplos nós por item)
 * ----------------------------------------------------------- */

type Key = string | number;
type RenderItem<T> = (item: T) => Child;

function removeBlockRange(start: Node, end: Node): void {
  const parent = start.parentNode;
  if (!parent) return;
  let n: Node | null = start;
  while (n) {
    const nxt: Node | null = n.nextSibling;
    destroyNode(n);
    parent.removeChild(n);
    if (n === end) break;
    n = nxt;
  }
}

function moveBlockBefore(start: Node, end: Node, ref: Node | null): void {
  const parent = start.parentNode;
  if (!parent) return;
  const frag = document.createDocumentFragment();
  let n: Node | null = start;
  while (n) {
    const nxt: Node | null = n.nextSibling;
    frag.appendChild(n);
    if (n === end) break;
    n = nxt;
  }
  parent.insertBefore(frag, ref);
}

function createBlockBefore<T>(
  parent: Node,
  ref: Node | null,
  renderItem: RenderItem<T>,
  item: T
): { start: Comment; end: Comment } {
  const start = document.createComment("repeat:start");
  const end = document.createComment("repeat:end");
  const frag = document.createDocumentFragment();

  frag.appendChild(start);
  const out = renderItem(item);
  appendChildSmart(frag, out);
  frag.appendChild(end);

  parent.insertBefore(frag, ref);
  return { start, end };
}

export function Repeat<T>(
  listSig: ReadonlySignal<T[]> | Signal<T[]>,
  keyOf: (item: T) => Key,
  renderItem: RenderItem<T>
): Node {
  const anchor = document.createTextNode("");
  const byKey = new Map<Key, { start: Comment; end: Comment }>();

  function mountInitial(items: T[]): void {
    const parent = anchor.parentNode!;
    let ref: Node | null = anchor.nextSibling;
    for (const it of items) {
      const k = keyOf(it);
      const blk = createBlockBefore(parent, ref, renderItem, it);
      byKey.set(k, blk);
      ref = blk.end.nextSibling;
    }
  }

  function patch(nextItems: T[]): void {
    const parent = anchor.parentNode!;
    const seen = new Set<Key>();
    let cursor: Node = anchor;

    for (const it of nextItems) {
      const k = keyOf(it);
      seen.add(k);
      const exist = byKey.get(k);

      if (!exist) {
        const blk = createBlockBefore(parent, cursor.nextSibling, renderItem, it);
        byKey.set(k, blk);
        cursor = blk.end;
      } else {
        const shouldBeRef: Node | null = cursor.nextSibling;
        if (exist.start !== shouldBeRef) {
          moveBlockBefore(exist.start, exist.end, shouldBeRef);
        }
        cursor = exist.end;
      }
    }

    for (const [k, blk] of byKey) {
      if (!seen.has(k)) {
        removeBlockRange(blk.start, blk.end);
        byKey.delete(k);
      }
    }
  }

  // monta quando a âncora estiver no DOM
  queueMicrotask(() => mountInitial((listSig as ReadonlySignal<T[]>).get()));

  const unsub = (listSig as ReadonlySignal<T[]>).subscribe((arr) => patch(arr));
  addCleanup(anchor, unsub);

  return anchor;
}

