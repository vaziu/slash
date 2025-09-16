# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] — 2025-09-16

### Highlights
- **Tiny, reactive UI runtime**: HTM + lightweight hyperscript, **no VDOM**.
- **Deterministic keyed updates** with `Repeat(...)` that move DOM blocks instead of re-creating them.
- **Type-safe events** and **CSS Modules–friendly** class handling.
- **DX first**: strings, arrays, and signals all work directly in templates and props.

---

### Added
- **Templating & Components**
  - `html` tagged template (via `htm.bind(h)`) and a minimal `h(tag, props, ...children)` runtime.
  - **Function components**: call with props + `children`; may return a `Node`, a `Child` union (string/signal/array), or multiple nodes (packed into a `DocumentFragment` automatically).

- **Reactivity**
  - `createSignal<T>(initial)` — minimal, synchronous signal with `get/set/subscribe`.
  - `computed(fn)` — memoized derivations that re-run precisely when their dependencies change.
  - **Reactive props/children**: any prop value or template interpolation can be a signal; text nodes update in place.

- **Events**
  - Case-insensitive `onXxx` props (e.g., `onClick` **or** `onclick`).
  - Optional sugar: `[handler, options]` where `options` is `boolean | AddEventListenerOptions` (e.g., `{ once: true }`).
  - **Automatic cleanup**: listeners are removed when nodes are destroyed.

- **Class & Style ergonomics**
  - `class` / `className` accept:
    - `string`
    - `string[]` (joined with spaces)
    - `{ [className]: boolean }` maps (truthy keys included)
  - `style` accepts a plain object (merged via `Object.assign`).

- **Rendering**
  - `render(view, container)` accepts a single node, **multiple nodes**, strings, arrays, or signals; returns the mounted `Node | Node[]`.
  - Previous subtree is cleaned via `destroyNode` so event listeners/subscriptions don’t leak.

- **Lists**
  - `Repeat(listSignal, keyOf, renderItem)` — keyed diff using comment sentinels (`<!--repeat:start--> … <!--repeat:end-->`):
    - Supports **multiple nodes per item**.
    - Reorders by **moving blocks**; preserves DOM state and handlers.
    - Removes only the blocks whose keys disappeared.

- **DX helpers**
  - `modelText(signal)` — one-way binding for `<input>` text. In HTM, spread it:  
    `...${modelText(name)}`
  - **CSS Modules friendly**: `class=${{[styles.foo]: cond, [styles.bar]: !cond}}` works and stays typed with your generated `.d.ts`.

---

### Changed
- N/A — first public release. (Prior internal iterations were folded into this version.)

---

### Stability & polish
- **HTM binding** uses `htm.bind(h)` directly (not extracting `.bind`) to avoid runtime errors like  
  _“Function.prototype.bind called on incompatible undefined”_.
- Event registration never passes `null` options and avoids ambiguous overloads.

---

### Usage notes
- When using `modelText`, **remember to spread** the object in HTM:  
  ```html
  <input ...${modelText(name)} />
  ```
- Prefer **CSS classes** over reactive style objects for better performance on frequent updates:
  ```html
  <li class=${computed(() => (done.get() ? `${styles.todo} ${styles.done}` : styles.todo))}>
    …
  </li>
  ```

---

### Known limitations
- This runtime is intentionally minimal: it does not implement a virtual DOM.
- Effects beyond `computed` should be implemented by subscribing to signals explicitly if needed for side-effects.

---

### Internal (repo)
- A development **playground** demonstrates the todo list with signals, `Repeat`, events, and CSS Modules.
- Optional CSS-types generator (watcher) is available in the playground to emit `.d.ts` for `*.module.css` files; the core library works with any CSS Modules setup.
