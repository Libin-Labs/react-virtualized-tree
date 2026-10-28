# @lp-labs/react-virtualized-tree

An accessible, lightweight React tree with virtualized rows, filtering, expansion, selection, and custom renderers. Inspired by react-virtualized-tree without depending on react-virtualized, icon packages, stylesheet packages, or any runtime library other than the application's React.

React 18+; includes TypeScript declarations, tree-shakeable ESM, CommonJS, and a browser entry. No CSS import is required. Package entry points use `.js` files, and release checks install the packed archive into a separate consumer project before packaging completes.

The full minified ESM build is approximately **5.3 KiB gzipped**, excluding React. Tree shaking can reduce consumer bundles further; size may vary between releases.

## Installation

```sh
npm install @lp-labs/react-virtualized-tree
```

Use the React version already installed in your application. React DOM is needed by your application to mount components; this library imports only React.

## Basic Tree

```jsx
import { useState } from 'react';
import Tree from '@lp-labs/react-virtualized-tree';

export function Explorer() {
  const [nodes, setNodes] = useState([
    {
      id: 'documents',
      name: 'Documents',
      state: { expanded: true },
      children: [
        { id: 'notes', name: 'Notes.txt' },
        { id: 'report', name: 'Report.pdf' },
      ],
    },
    { id: 'pictures', name: 'Pictures', children: [] },
  ]);

  return <Tree nodes={nodes} onChange={setNodes} height={360} aria-label="Files" />;
}
```

For an uncontrolled tree, pass `defaultNodes` instead of `nodes`. `defaultNodes` is read only on the first mount. A controlled tree requires `onChange` to apply interaction changes. Keep nodes immutable and replace the array when data changes; the expensive tree model is cached by the array and filter identities, so scrolling does not rebuild the tree.

## Node Shape

```ts
interface TreeNode {
  id: string | number;
  name?: string;
  children?: readonly TreeNode[];
  hasChildren?: boolean;
  state?: {
    expanded?: boolean;
    selected?: boolean;
    disabled?: boolean;
    loading?: boolean;
  };
}
```

IDs must be unique across the entire tree. Strings must be nonempty; numeric IDs must be finite. `1` and `'1'` are distinct IDs. Duplicate IDs, circular trees, and non-array children are rejected. Arbitrary application fields are retained and are available in custom renderers.

Nodes with actual children are branches. Set `hasChildren: true` to make an unloaded node expandable. Empty nodes without that flag are leaves. `state.loading` adds `aria-busy`; it does not fetch data or display a loading indicator automatically. Disabled nodes cannot be directly selected or expanded, and keyboard navigation skips them.

## Tree Props

| Prop | Default | Behavior |
| --- | --- | --- |
| `nodes` | uncontrolled | Controlled node array |
| `defaultNodes` | `[]` | Initial uncontrolled node array |
| `onChange(nextNodes, change)` | none | Full updated tree and action metadata |
| `height` | `320` | Viewport height in pixels; positive finite number |
| `rowHeight` | `32` | Fixed row height in pixels; positive finite number |
| `overscan` | `5` | Extra rows above and below the viewport |
| `width` | `'100%'` | CSS width |
| `indent` | `20` | Indentation per depth level in pixels |
| `selectionMode` | `'single'` | `'none'`, `'single'`, or `'multiple'` |
| `showCheckboxes` | `false` | Show selection checkboxes using the same selection state |
| `onToggle(node, expanded)` | none | Expansion callback, suitable for starting external lazy loading |
| `onSelectionChange(ids, node)` | none | Selected IDs and the interaction target |
| `filter(node)` | none | Predicate; keeps matching nodes and ancestors, revealing matches |
| `children` / `renderNode` | `NodeRenderer` | Custom row render function; `renderNode` takes precedence |
| `rowClassName` | none | String or function of renderer props |
| `rowStyle` | none | CSS style or function of renderer props |
| `emptyContent` | `'No items'` | Content shown when no rows remain |

Standard div attributes and `className`, `style`, `id`, `aria-label`, `onScroll`, `onKeyDown`, `onFocus`, and `onBlur` are supported. The component owns its tree role, active-descendant behavior, tab stop, and scrolling geometry. Row geometry and indentation take precedence over `rowStyle`; keep custom content within `rowHeight`. Names truncate by default and have a title tooltip.

`change` is one of:

- `{ type: 'expand', node, expanded }`
- `{ type: 'select', node, selectedIds, selectionMode }`
- `{ type: 'update', node, update }`

The callback's `node` is the node before the update. Selection and expansion are stored in `node.state`; there is no separate hidden selection store.

## Selection And Keyboard Navigation

```jsx
<Tree
  nodes={nodes}
  onChange={setNodes}
  selectionMode="multiple"
  showCheckboxes
  onSelectionChange={(ids) => console.log(ids)}
/>
```

Plain clicks replace selection. Ctrl/Cmd-click toggles individual items; Shift-click selects a visible range, excluding disabled nodes. Checkbox actions toggle individual selection without clearing other items. Single-selection checkboxes may clear the selection. Selection is independent of branch expansion: selecting a parent does not select descendants, and there is no tri-state cascade behavior.

The tree uses one keyboard tab stop and `aria-activedescendant`. Rows expose their level, sibling position/count, expansion, disabled, busy, and selection state. The active row remains mounted even if it is outside the viewport, so its accessibility reference stays valid; this adds at most one row beyond the normal window.

| Key | Action |
| --- | --- |
| Up / Down | Move active focus, skipping disabled nodes |
| Right | Expand a branch, or move to its first enabled visible child |
| Left | Collapse a branch, or move to its parent |
| Home / End | First / last enabled visible row |
| Page Up / Page Down | Move approximately one viewport |
| Enter | Select the active row |
| Space | Toggle selection of the active row |
| Shift + navigation | Extend a visible selection range in multiple mode |
| Ctrl/Cmd + A | Select enabled visible rows in multiple mode |
| Printable characters | Prefix search of visible rows; repeated characters cycle matches |

Keyboard navigation does not automatically select rows. User `onKeyDown` runs first and can call `preventDefault()` to override handling. Keyboard events originating from nested custom inputs are not intercepted. Custom interactive row content must supply its own accessible names and keyboard behavior.

## Filtering

```jsx
import { useState } from 'react';
import Tree, { FilteringContainer } from '@lp-labs/react-virtualized-tree';

export function SearchableTree({ initialNodes }) {
  const [nodes, setNodes] = useState(initialNodes);

  return (
    <FilteringContainer nodes={nodes} onChange={setNodes} searchLabel="Search files">
      {({ nodes: matches, onChange }) => (
        <Tree nodes={matches} onChange={onChange} height={360} selectionMode="multiple" />
      )}
    </FilteringContainer>
  );
}
```

The search input defaults to case-insensitive name matching. Matches and their ancestors are retained, and ancestors are expanded to reveal results. Use the render callback's `onChange` bridge: it updates the **original** tree instead of replacing it with a pruned tree. Hidden selections are retained in multiple-selection mode; single selection replaces the overall selection.

Search filtering uses React's deferred rendering. `search`, `onSearchChange`, `defaultSearch`, `predicate(node, query)`, `searchLabel`, `placeholder`, `className`, and `style` are supported. The render callback also receives `search` and `setSearch`.

While searching, matching ancestor paths are forced open; expansion edits still update the original state but may not visibly collapse matching paths until the search is cleared. `onSelectionChange` attached directly to the filtered Tree describes its filtered input; use `FilteringContainer.onChange` when reading the final full-tree selection. Avoid passing `setNodes` directly to a Tree whose nodes were pruned separately: that would discard hidden branches.

Alternatively, pass a stable `filter` function directly to Tree. It reveals matching paths without modifying node expansion state. In that case the Tree still owns the original unfiltered array, so its `onChange` can be your original setter.

## Custom Renderers

```jsx
import Tree, { Expandable, Selectable } from '@lp-labs/react-virtualized-tree';

<Tree nodes={nodes} onChange={setNodes} selectionMode="multiple" showCheckboxes>
  {(props) => (
    <Expandable {...props}>
      <Selectable {...props}>
        <span>{props.node.name}</span>
      </Selectable>
    </Expandable>
  )}
</Tree>;
```

Renderers receive the original `node`, `depth` (`deepness` alias), `parentId`, visible `index`, sibling `position` and `setSize`, `isLeaf`, `expanded`, `selected`, `disabled`, `active`, `selectionMode`, and `showCheckboxes`. Actions are `toggleExpanded()`, `toggleSelected()`, `select(modifiers?)`, and `update(patchOrUpdater)`.

The outer row handles selection clicks except those on buttons, links, inputs, selects, textareas, or editable elements. Custom controls can call the actions explicitly. `update` accepts a partial node object or an updater function and must preserve the node ID. A partial `state` replaces that state object; merge it explicitly when preserving state fields.

`NodeRenderer`, `Expandable`, `Selectable`, and the `renderers` object are exported. No icon fonts are needed. The default expander uses familiar plus/minus controls; colors inherit the host interface and system selection colors. Custom row styling can replace those defaults.

## Imperative Scrolling

```jsx
import { useRef } from 'react';
import Tree from '@lp-labs/react-virtualized-tree';

function Explorer({ nodes, onChange }) {
  const treeRef = useRef(null);
  return (
    <>
      <button onClick={() => treeRef.current?.focus('report')}>Focus report</button>
      <Tree ref={treeRef} nodes={nodes} onChange={onChange} />
    </>
  );
}
```

The ref exposes `focus(id?)`, `scrollToId(id, { align })`, `scrollToIndex(index, { align })`, and `getVisibleNodes()`. Alignments are `auto` (default), `start`, `center`, and `end`. Focus and scroll methods return `false` if the target is not in the flattened visible tree; focus also rejects disabled targets. Expand ancestors before targeting collapsed descendants. `getVisibleNodes()` means all logically visible rows, not just mounted DOM rows.

## Immutable Helpers

```js
import { flattenTree, updateNode, removeNode, mapTree, filterTree, setSelection, getWindow } from '@lp-labs/react-virtualized-tree';

const expanded = updateNode(nodes, 'documents', (node) => ({
  ...node,
  state: { ...node.state, expanded: true },
}));
const withoutReport = removeNode(expanded, 'report');
const selected = setSelection(withoutReport, ['notes']);
const rows = flattenTree(selected);
```

`updateNode` copies only the modified node and its ancestors. Unknown IDs return the original array. `mapTree` runs bottom-up and preserves unchanged references; mappers must preserve node IDs and should update fields/state rather than restructure children. `filterTree` returns matching nodes and ancestor paths, with retained branches expanded. Helpers do not mutate their inputs or recursively walk the JavaScript stack. `getWindow` exposes the fixed-height window calculation for custom integrations.

## Performance And Scope

- Runtime dependency: React as a peer only. No react-virtualized, react-window, stylesheets, or icon libraries.
- Fixed-height virtualization mounts viewport rows plus overscan and, when needed, one pinned active row. Variable/measured row heights are not supported.
- Tree validation, model rebuilding, filtering, and selection helpers take O(total nodes) time; the cached model is not rebuilt on ordinary scrolling. Input data and the flattened model remain in memory. Extremely large data sets may need application-level loading or workers.
- All node IDs are checked even in collapsed branches. Use immutable input arrays and stable predicates to avoid unnecessary rebuilding.
- Deep trees are traversed iteratively, though indentation and browser layout still limit practical display depth. Browsers also cap maximum scrollable element heights; segmented multi-billion-pixel scrolling is not implemented.
- Supports SSR initial markup and includes the `use client` directive for React Server Component environments. Rendering tests cover ARIA attributes, but real screen-reader behavior should be checked in your target browser/assistive-technology combination.
- No built-in drag/drop, animations, variable row heights, network loader, undo history, cascade checkboxes, or automatic parent selection. Load nodes in your application using `onToggle` and immutable updates.
- This is a similar library, not a guaranteed drop-in replacement for react-virtualized-tree. Renderer shapes, change metadata, and helper APIs differ. There is no react-virtualized List instance or legacy stylesheet API.

## Support

Support maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/).