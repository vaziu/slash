// hyper.ts
import htm from 'htm';
import type { Signal } from './signals';

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

// função‐componente
export type Component<P = Record<string, unknown>> =
  (props: P & { children?: Child[] }) => Child;

const SVG_NS = 'http://www.w3.org/2000/svg';

export const html = htm.bind(hyper);

// ————— core —————

export function hyper(
  type: string | Component,
  rawProps: Props | null,
  ...rawChildren: Child[]
): Node {
  const props: Props = rawProps ?? {};
  const children = flat(rawChildren);

  // componente (função): chama e volta ao hyper
  if (typeof type === 'function') {
    return toNode(type({ ...props, children }));
  }

  // elemento nativo
  const isSvg = type === 'svg' || props?.['isSvg'] === true;
  const el = isSvg
    ? document.createElementNS(SVG_NS, type as string)
    : document.createElement(type as string);

  // aplica props
  for (const [key, val] of Object.entries(props)) {
    if (key === 'children' || key === 'isSvg') continue;

    if (isEventProp(key) && typeof val === 'function') {
      // onClick → click, onKeyUp → keyup
      el.addEventListener(eventName(key), val as EventListener);
      continue;
    }

    // Signal em prop → atualiza propriedade/atributo quando mudar
    if (isSignal(val)) {
      bindSignalToProp(el, key, val as Signal<unknown>);
      continue;
    }

    // estilos em objeto
    if (key === 'style' && isPlainObject(val)) {
      Object.assign((el as HTMLElement).style, val as Record<string, string>);
      continue;
    }

    // class / className
    if (key === 'class' || key === 'className') {
      (el as HTMLElement).className = String(val ?? '');
      continue;
    }

    // attrs booleanos
    if (typeof val === 'boolean') {
      if (val) el.setAttribute(key, '');
      else el.removeAttribute(key);
      continue;
    }

    // fallback: propriedade se existir, senão atributo
    if (key in el) {
      (el as Record<string, unknown>)[key] = val as unknown;
    } else {
      el.setAttribute(key, String(val));
    }
  }

  // aplica children
  for (const child of children) appendChild(el, child);

  return el;
}

export function render(target: Element, tree: Child): void {
  // monta uma vez; updates vêm da reatividade nos nós
  target.replaceChildren(toNode(tree));
}

// ————— helpers —————

function isSignal(x: unknown): x is Signal<unknown> {
  return !!x && typeof x === 'object' && 'get' in (x as Record<string, unknown>) && 'set' in (x as Record<string, unknown>);
}

function bindSignalToProp(el: Element, key: string, sig: Signal<unknown>) {
  const apply = (v: unknown) => {
    if (key === 'textContent') {
      el.textContent = v == null ? '' : String(v);
      return;
    }
    if (key === 'class' || key === 'className') {
      (el as HTMLElement).className = String(v ?? '');
      return;
    }
    if (key in el) {
      (el as Record<string, unknown>)[key] = v as unknown;
    } else {
      if (v == null) el.removeAttribute(key);
      else el.setAttribute(key, String(v));
    }
  };
  // primeira pintura + subscribe
  apply(sig.get());
  sig.subscribe(apply);
}

function appendChild(parent: Element, child: Child) {
  if (child == null || child === false) return;

  // sinal em filho → TextNode reativo
  if (isSignal(child)) {
    const text = document.createTextNode('');
    parent.appendChild(text);
    const apply = (v: unknown) => { text.data = v == null ? '' : String(v); };
    apply((child as Signal<unknown>).get());
    (child as Signal<unknown>).subscribe(apply);
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

  // string/number/boolean → texto
  parent.appendChild(document.createTextNode(String(child)));
}

function toNode(x: Child): Node {
  if (x instanceof Node) return x;
  if (isSignal(x)) {
    const t = document.createTextNode('');
    const s = x as Signal<unknown>;
    t.data = s.get() == null ? '' : String(s.get());
    s.subscribe((v) => { t.data = v == null ? '' : String(v); });
    return t;
  }
  if (isIterable(x)) {
    const frag = document.createDocumentFragment();
    for (const c of x as Iterable<Child>) frag.appendChild(toNode(c));
    return frag;
  }
  return document.createTextNode(String(x ?? ''));
}

function isEventProp(k: string) {
  return /^on[A-Z]/.test(k);
}
function eventName(k: string) {
  return k.slice(2).toLowerCase(); // onClick -> click, onKeyUp -> keyup
}
function flat(list: Child[]): Child[] {
  const out: Child[] = [];
  (function rec(a: Child[]) {
    for (const x of a) {
      if (x == null || x === false) continue;
      if (isIterable(x)) rec(Array.from(x));
      else out.push(x);
    }
  })(list);
  return out;
}
function isIterable(x: unknown): x is Iterable<unknown> {
  return !!x && typeof (x as Record<string, unknown>)[Symbol.iterator] === 'function';
}
function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && Object.getPrototypeOf(x) === Object.prototype;
}

