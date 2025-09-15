// components.ts
import { html } from './hyper';
import type { Signal } from './signals';

// For/Repeat keyed: usa um anchor e gerencia nós por chave
export function Repeat<T, K>(props: {
  each: Signal<T[]>;
  key: (item: T, idx: number) => K;
  children: (item: T, idx: number) => Node; // recebe item e retorna DOM via html`...`
}) {
  const anchor = document.createComment('repeat');
  const parentFrag = document.createDocumentFragment();
  parentFrag.appendChild(anchor);

  const byKey = new Map<K, Node>();

  const renderAll = (arr: T[]) => {
    const parent = anchor.parentNode as Node & ParentNode;
    if (!parent) return;

    const next: Node[] = [];
    const seen = new Set<K>();

    arr.forEach((item, i) => {
      const k = props.key(item, i);
      seen.add(k);
      let node = byKey.get(k);
      if (!node) {
        node = props.children(item, i);
        byKey.set(k, node);
      }
      next.push(node);
    });

    // remove nós que saíram
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

  // primeira renderização + reatividade
  renderAll(props.each.get());
  props.each.subscribe(renderAll);

  return parentFrag;
}

// conveniência: uso em literais: <${Repeat} each=${todos} key=${t=>t.id}>${(t)=>html`...`}</${Repeat}>

