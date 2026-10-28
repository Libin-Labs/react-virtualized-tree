'use client';

import { Fragment, createElement, forwardRef, useDeferredValue, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { filterTree, getWindow, indexTree, setSelection, updateNode, visibleModel } from './model.js';

export { filterTree, flattenTree, getWindow, mapTree, removeNode, setSelection, updateNode } from './model.js';

const labelOf = (node) => String(node.name ?? node.id);
const matchName = (node, query) => labelOf(node).toLocaleLowerCase().includes(query.toLocaleLowerCase());

export function Expandable({ node, isLeaf, expanded, disabled, toggleExpanded, children }) {
  const label = `${expanded ? 'Collapse' : 'Expand'} ${labelOf(node)}`;
  let control = createElement('span', { 'aria-hidden': true, style: { display: 'inline-block', width: 20, flexShrink: 0 } });
  if (!isLeaf) {
    control = createElement('button', {
      type: 'button', tabIndex: -1, disabled, title: label, 'aria-label': label,
      onClick: (event) => { event.stopPropagation(); toggleExpanded(); },
      style: { width: 20, height: 20, flexShrink: 0, padding: 0, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', lineHeight: 1, cursor: disabled ? 'default' : 'pointer' },
    }, expanded ? '-' : '+');
  }
  return createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, width: '100%' } }, control, children);
}

export function Selectable({ node, selected, disabled, toggleSelected, showCheckboxes = true, selectionMode = 'multiple', children }) {
  if (!showCheckboxes || selectionMode === 'none') return createElement(Fragment, null, children);
  return createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 } },
    createElement('input', {
      type: 'checkbox', tabIndex: -1, checked: selected, disabled, 'aria-label': `Select ${labelOf(node)}`,
      onClick: (event) => event.stopPropagation(), onChange: () => toggleSelected(),
      style: { margin: 0, flexShrink: 0 },
    }), children);
}

export function NodeRenderer(props) {
  return createElement(Expandable, props, createElement(Selectable, props,
    createElement('span', { title: labelOf(props.node), style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, labelOf(props.node))));
}

export const renderers = Object.freeze({ Expandable, Selectable, NodeRenderer });

function nextEnabled(rows, index, direction) {
  for (let cursor = index; cursor >= 0 && cursor < rows.length; cursor += direction) if (!rows[cursor].disabled) return rows[cursor];
  return null;
}

function resolveActive(model, id) {
  let entry = model.byId.get(id);
  while (entry) {
    const row = model.rowById.get(entry.node.id);
    if (row && !row.disabled) return row;
    entry = model.entries[entry.parentIndex];
  }
  return model.defaultActive;
}

function targetOffset(row, align, current, height, rowHeight, count) {
  if (!['auto', 'start', 'center', 'end'].includes(align)) throw new TypeError('Alignment must be auto, start, center, or end.');
  let top = row.index * rowHeight;
  if (align === 'center') top -= (height - rowHeight) / 2;
  if (align === 'end') top -= height - rowHeight;
  if (align === 'auto') {
    if (top >= current && top + rowHeight <= current + height) return current;
    if (top > current) top -= height - rowHeight;
  }
  return Math.max(0, Math.min(top, Math.max(0, count * rowHeight - height)));
}

function extendSelection(model, row, anchor, selected, event) {
  if (!event.ctrlKey && !event.metaKey) selected.clear();
  const low = Math.min(row.index, anchor.index);
  const high = Math.max(row.index, anchor.index);
  for (let index = low; index <= high; index += 1) if (!model.rows[index].disabled) selected.add(model.rows[index].node.id);
}

function selectionIds(model, row, mode, event, anchorId, additive) {
  if (mode === 'single') return row.selected && additive ? [] : [row.node.id];
  const selected = new Set(model.entries.filter(({ node }) => node.state?.selected).map(({ node }) => node.id));
  const anchor = model.rowById.get(anchorId);
  if (event?.shiftKey && anchor) {
    extendSelection(model, row, anchor, selected, event);
  } else if (additive || event?.ctrlKey || event?.metaKey) {
    if (selected.has(row.node.id)) selected.delete(row.node.id);
    else selected.add(row.node.id);
  } else return [row.node.id];
  return [...selected];
}

export const Tree = forwardRef(function Tree({
  nodes: controlledNodes, defaultNodes = [], onChange, onToggle, onSelectionChange,
  height = 320, rowHeight = 32, overscan = 5, indent = 20, width = '100%',
  selectionMode = 'single', showCheckboxes = false, filter, children, renderNode,
  rowClassName, rowStyle, emptyContent = 'No items', className, style, id,
  onScroll, onKeyDown, onFocus, onBlur, ...domProps
}, forwardedRef) {
  if (!['none', 'single', 'multiple'].includes(selectionMode)) throw new TypeError('selectionMode must be none, single, or multiple.');
  if (!Number.isFinite(indent) || indent < 0) throw new RangeError('indent must be a nonnegative finite number.');
  const [internalNodes, setInternalNodes] = useState(defaultNodes);
  const nodes = controlledNodes ?? internalNodes;
  const model = useMemo(() => visibleModel(nodes, { filter }), [nodes, filter]);
  const container = useRef(null);
  const anchor = useRef(null);
  const typeahead = useRef({ text: '', time: 0 });
  const generatedId = useId();
  const treeId = id ?? `tree-${generatedId}`;
  const [activeId, setActiveId] = useState(null);
  const [focused, setFocused] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const active = resolveActive(model, activeId);
  const range = getWindow({ count: model.rows.length, rowHeight, height, scrollTop, overscan });
  const Renderer = renderNode ?? children ?? NodeRenderer;
  if (typeof Renderer !== 'function') throw new TypeError('Tree children or renderNode must be a render function.');

  function commit(next, change) {
    if (controlledNodes === undefined) setInternalNodes(next);
    onChange?.(next, change);
  }

  function scrollTo(row, align = 'auto') {
    if (!row) return false;
    const next = targetOffset(row, align, range.scrollTop, height, rowHeight, model.rows.length);
    if (container.current) container.current.scrollTop = next;
    setScrollTop(next);
    return true;
  }

  function activate(row, scroll = true) {
    if (!row || row.disabled) return false;
    setActiveId(row.node.id);
    if (scroll) scrollTo(row);
    container.current?.focus({ preventScroll: true });
    return true;
  }

  function toggle(row) {
    if (row.isLeaf || row.disabled) return;
    const expanded = !row.expanded;
    const next = updateNode(nodes, row.node.id, (node) => ({ ...node, state: { ...node.state, expanded } }));
    activate(row, false);
    commit(next, { type: 'expand', node: row.node, expanded });
    onToggle?.(row.node, expanded);
  }

  function select(row, event, additive = false) {
    if (row.disabled || selectionMode === 'none') return;
    const ids = selectionIds(model, row, selectionMode, event, anchor.current, additive);
    if (!event?.shiftKey) anchor.current = row.node.id;
    activate(row, false);
    commit(setSelection(nodes, ids), { type: 'select', node: row.node, selectedIds: ids, selectionMode });
    onSelectionChange?.(ids, row.node);
  }

  function move(row, event) {
    if (event.shiftKey && anchor.current === null && active) anchor.current = active.node.id;
    if (!activate(row)) return;
    if (event.shiftKey && selectionMode === 'multiple') select(row, event);
  }

  function navigateHorizontal(row, event) {
    if (event.key === 'ArrowRight') {
      if (!row.isLeaf && !row.expanded) toggle(row);
      else if (model.rows[row.index + 1]?.parentId === row.node.id) {
        const child = nextEnabled(model.rows, row.index + 1, 1);
        if (child && child.depth > row.depth) move(child, event);
      }
      return;
    }
    if (!row.isLeaf && row.expanded) toggle(row);
    else move(model.rowById.get(row.parentId), event);
  }

  function typeToFocus(row, event) {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    const now = Date.now();
    const previous = typeahead.current;
    const text = now - previous.time < 700 ? previous.text + event.key : event.key;
    typeahead.current = { text, time: now };
    let query = text.toLocaleLowerCase();
    if ([...query].every((character) => character === query[0])) query = query[0];
    for (let offset = 1; offset <= model.rows.length; offset += 1) {
      const candidate = model.rows[(row.index + offset) % model.rows.length];
      if (!candidate.disabled && labelOf(candidate.node).toLocaleLowerCase().startsWith(query)) { event.preventDefault(); activate(candidate); break; }
    }
  }

  function navigate(event) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.target !== event.currentTarget || !active) return;
    const row = active;
    const movements = {
      ArrowDown: () => nextEnabled(model.rows, row.index + 1, 1),
      ArrowUp: () => nextEnabled(model.rows, row.index - 1, -1),
      Home: () => nextEnabled(model.rows, 0, 1),
      End: () => nextEnabled(model.rows, model.rows.length - 1, -1),
      PageDown: () => nextEnabled(model.rows, Math.min(model.rows.length - 1, row.index + Math.max(1, Math.floor(height / rowHeight))), 1),
      PageUp: () => nextEnabled(model.rows, Math.max(0, row.index - Math.max(1, Math.floor(height / rowHeight))), -1),
    };
    if (movements[event.key]) { event.preventDefault(); move(movements[event.key](), event); return; }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); navigateHorizontal(row, event); return; }
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); select(row, event, event.key === ' '); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && selectionMode === 'multiple') {
      event.preventDefault();
      const ids = model.rows.filter((item) => !item.disabled).map((item) => item.node.id);
      commit(setSelection(nodes, ids), { type: 'select', node: row.node, selectedIds: ids, selectionMode });
      onSelectionChange?.(ids, row.node);
      return;
    }
    typeToFocus(row, event);
  }

  useEffect(() => {
    if (scrollTop !== range.scrollTop) {
      setScrollTop(range.scrollTop);
      if (container.current) container.current.scrollTop = range.scrollTop;
    }
  }, [scrollTop, range.scrollTop]);

  useImperativeHandle(forwardedRef, () => ({
    focus: (nodeId) => activate(nodeId === undefined ? active : model.rowById.get(nodeId)),
    scrollToId: (nodeId, options = {}) => scrollTo(model.rowById.get(nodeId), options.align),
    scrollToIndex: (index, options = {}) => scrollTo(model.rows[index], options.align),
    getVisibleNodes: () => model.rows.slice(),
  }));

  const rowId = (row) => `${treeId}-node-${typeof row.node.id}-${Array.from(String(row.node.id), (character) => character.codePointAt(0).toString(16)).join('-')}`;
  const indices = [];
  for (let index = range.start; index < range.end; index += 1) indices.push(index);
  if (active && (active.index < range.start || active.index >= range.end)) indices.push(active.index);
  indices.sort((left, right) => left - right);
  const rows = indices.map((index) => {
    const row = model.rows[index];
    const isActive = row.node.id === active?.node.id;
    const properties = {
      ...row, active: isActive, selectionMode, showCheckboxes,
      toggleExpanded: () => toggle(row), select: (event) => select(row, event), toggleSelected: () => select(row, undefined, true),
      update: (patch) => commit(updateNode(nodes, row.node.id, patch), { type: 'update', node: row.node, update: patch }),
    };
    const customStyle = typeof rowStyle === 'function' ? rowStyle(properties) : rowStyle;
    return createElement('div', {
      key: rowId(row), id: rowId(row), role: 'treeitem',
      'aria-level': row.depth + 1, 'aria-posinset': row.position, 'aria-setsize': row.setSize,
      'aria-expanded': row.isLeaf ? undefined : row.expanded,
      'aria-selected': selectionMode === 'none' ? undefined : row.selected,
      'aria-disabled': row.disabled || undefined, 'aria-busy': row.node.state?.loading || undefined,
      className: typeof rowClassName === 'function' ? rowClassName(properties) : rowClassName,
      onClick: (event) => {
        if (event.target.closest?.('button,input,a,select,textarea,[contenteditable="true"]')) return;
        activate(row, false);
        select(row, event);
      },
      style: {
        background: row.selected ? 'Highlight' : undefined, color: row.selected ? 'HighlightText' : undefined,
        outline: isActive && focused ? '1px solid currentColor' : undefined, outlineOffset: -1,
        opacity: row.disabled ? 0.5 : 1, ...customStyle,
        position: 'absolute', top: index * rowHeight, left: 0, right: 0, height: rowHeight,
        boxSizing: 'border-box', paddingLeft: row.depth * indent + 4, paddingRight: 4,
        display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', letterSpacing: 0,
      },
    }, createElement(Renderer, properties));
  });

  return createElement('div', {
    ...domProps, ref: container, id: treeId, className, role: 'tree', tabIndex: 0,
    'aria-label': domProps['aria-label'] ?? 'Tree',
    'aria-multiselectable': selectionMode === 'multiple' || undefined,
    'aria-activedescendant': active ? rowId(active) : undefined,
    onKeyDown: navigate,
    onFocus: (event) => { setFocused(true); onFocus?.(event); },
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      onBlur?.(event);
    },
    onScroll: (event) => { setScrollTop(event.currentTarget.scrollTop); onScroll?.(event); },
    style: { ...style, height, width, overflow: 'auto', position: 'relative', boxSizing: 'border-box', letterSpacing: 0 },
  }, createElement('div', { role: 'none', style: { height: range.totalHeight, minHeight: model.rows.length ? undefined : height, position: 'relative' } },
    model.rows.length ? rows : createElement('div', { role: 'status', style: { padding: 8 } }, emptyContent)));
});

function originalChange(nodes, filtered, change) {
  if (change.type === 'expand') return updateNode(nodes, change.node.id, (node) => ({ ...node, state: { ...node.state, expanded: change.expanded } }));
  if (change.type === 'update') return updateNode(nodes, change.node.id, change.update);
  if (change.type === 'select') {
    let ids = change.selectedIds;
    if (change.selectionMode === 'multiple') {
      const displayed = new Set(indexTree(filtered).entries.map(({ node }) => node.id));
      const hidden = indexTree(nodes).entries.filter(({ node }) => node.state?.selected && !displayed.has(node.id)).map(({ node }) => node.id);
      ids = [...hidden, ...ids];
    }
    return setSelection(nodes, ids);
  }
  throw new TypeError('Filtered changes require Tree change metadata.');
}

export function FilteringContainer({ nodes, children, onChange, search: controlledSearch, defaultSearch = '', onSearchChange, predicate = matchName, searchLabel = 'Filter tree', placeholder = 'Filter tree', className, style }) {
  const [internalSearch, setInternalSearch] = useState(defaultSearch);
  const search = controlledSearch ?? internalSearch;
  const deferredSearch = useDeferredValue(search.trim());
  const filtered = useMemo(() => deferredSearch ? filterTree(nodes, (node) => predicate(node, deferredSearch)) : nodes, [nodes, predicate, deferredSearch]);
  const setSearch = (value) => {
    if (controlledSearch === undefined) setInternalSearch(value);
    onSearchChange?.(value);
  };
  return createElement('div', { className, style },
    createElement('input', {
      type: 'search', value: search, 'aria-label': searchLabel, placeholder,
      onChange: (event) => setSearch(event.currentTarget.value),
      style: { width: '100%', boxSizing: 'border-box', padding: 6, marginBottom: 8, font: 'inherit', letterSpacing: 0 },
    }), children({ nodes: filtered, search, setSearch, onChange: (next, change) => {
      onChange?.(deferredSearch ? originalChange(nodes, filtered, change) : next, change);
    } }));
}

export default Tree;