import type { Signal } from "./signals";

/**
 * Repeat keyed: usa um anchor e gerencia nós por chave.
 * Aceita children passado pelo htm como array; escolhe a 1ª função do array.
 */
export function Repeat<T, K>(props: {
  each: Signal<T[]>;
  key: (item: T, idx: number) => K;
  // htm passa children como array; aqui tipamos como unknown e normalizamos
  children?: unknown;
}) {
  const anchor = document.createComment("repeat");
  const frag = document.createDocumentFragment();
  frag.appendChild(anchor);

  // --- normaliza children -> renderer(item, idx): Node
  const renderer = normalizeChildrenToRenderer<T>(props.children);

  const byKey = new Map<K, Node>();

  const renderAll = (arr: T[]) => {
    const parent = anchor.parentNode as ParentNode | null;
    if (!parent) return;

    const next: Node[] = [];
    const seen = new Set<K>();

    arr.forEach((item, i) => {
      const k = props.key(item, i);
      seen.add(k);

      let n = byKey.get(k);
      if (!n) {
        n = renderer(item, i);
        byKey.set(k, n);
      } else {
        // se o renderer re-renderiza conteúdo textual/atributos internamente,
        // não precisamos trocar o nó; mas se você quiser permitir “replace”:
        // const fresh = renderer(item, i);
        // if (fresh !== n) { n.replaceWith(fresh); byKey.set(k, fresh); n = fresh; }
        // Para agora, mantemos o Node e só atualizamos por dentro, se o renderer fizer isso.
      }

      next.push(n);
    });

    // remove nós ausentes
    for (const [k, n] of byKey) {
      if (!seen.has(k)) {
        byKey.delete(k);
        n.parentNode?.removeChild(n);
      }
    }

    // aplica ordem com mínimo de movimentos
    let ptr: ChildNode | null = anchor.nextSibling;
    next.forEach((n) => {
      if (n !== ptr) parent.insertBefore(n, ptr);
      ptr = n.nextSibling;
    });
  };

  renderAll(props.each.get());
  props.each.subscribe(renderAll);

  return frag;
}

function normalizeChildrenToRenderer<T>(
  children: unknown
): (item: T, idx: number) => Node {
  // caso 1: já é função
  if (typeof children === "function") {
    return children as (item: T, idx: number) => Node;
  }

  // caso 2: array vindo do htm; ache a primeira função
  if (Array.isArray(children)) {
    const fn = children.find((c) => typeof c === "function");
    if (fn) return fn as (item: T, idx: number) => Node;

    // se veio um único Node/valor, renderize esse mesmo (clonado quando possível)
    if (children.length === 1) {
      const v = children[0];
      return () => coerceToNode(v);
    }
  }

  // fallback seguro (vazio)
  return () => document.createComment("repeat-item");
}

function coerceToNode(v: unknown): Node {
  if (v instanceof Node) return v.cloneNode(true);
  if (v == null || v === false) return document.createComment("empty");
  return document.createTextNode(String(v));
}

