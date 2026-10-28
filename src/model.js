function validId(id) {
  return (typeof id === 'string' && id.length > 0) || (typeof id === 'number' && Number.isFinite(id));
}

export function indexTree(nodes) {
  if (!Array.isArray(nodes)) throw new TypeError('Tree nodes must be an array.');
  const entries = [];
  const byId = new Map();
  const stack = [];
  function pushChildren(children, parentIndex, depth) {
    for (let position = children.length - 1; position >= 0; position -= 1) stack.push({ node: children[position], parentIndex, depth, position: position + 1, setSize: children.length });
  }
  pushChildren(nodes, -1, 0);
  while (stack.length) {
    const item = stack.pop();
    const { node, parentIndex, depth } = item;
    if (!node || typeof node !== 'object' || !validId(node.id)) throw new TypeError('Every node needs a nonempty string or finite numeric id.');
    if (byId.has(node.id)) throw new TypeError(`Duplicate node id or circular tree: ${node.id}`);
    if (node.children !== undefined && !Array.isArray(node.children)) throw new TypeError('Node children must be an array.');
    const entry = { ...item, parentId: parentIndex < 0 ? null : entries[parentIndex].node.id, index: entries.length };
    byId.set(node.id, entry);
    entries.push(entry);
    pushChildren(node.children ?? [], entry.index, depth + 1);
  }
  return { entries, byId };
}

function includedEntries(entries, filter) {
  if (!filter) return null;
  const included = new Set();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (filter(entry.node) || included.has(index)) {
      included.add(index);
      if (entry.parentIndex >= 0) included.add(entry.parentIndex);
    }
  }
  return included;
}

export function visibleModel(nodes, { filter } = {}) {
  const indexed = indexTree(nodes);
  const included = includedEntries(indexed.entries, filter);
  const rows = [];
  const visible = new Set();
  const expanded = new Set();
  const sizes = new Map();
  const positions = new Map();
  for (const entry of indexed.entries) {
    if (!included || included.has(entry.index)) sizes.set(entry.parentIndex, (sizes.get(entry.parentIndex) ?? 0) + 1);
  }
  for (const entry of indexed.entries) {
    if (included && !included.has(entry.index)) continue;
    if (entry.parentIndex >= 0 && (!visible.has(entry.parentIndex) || !expanded.has(entry.parentIndex))) continue;
    const isExpanded = included ? true : Boolean(entry.node.state?.expanded);
    visible.add(entry.index);
    if (isExpanded) expanded.add(entry.index);
    const position = (positions.get(entry.parentIndex) ?? 0) + 1;
    positions.set(entry.parentIndex, position);
    rows.push({
      node: entry.node, depth: entry.depth, deepness: entry.depth, parentId: entry.parentId,
      position, setSize: sizes.get(entry.parentIndex), index: rows.length,
      isLeaf: !entry.node.hasChildren && !(entry.node.children?.length),
      expanded: isExpanded, selected: Boolean(entry.node.state?.selected),
      disabled: Boolean(entry.node.state?.disabled),
    });
  }
  const defaultActive = rows.find((row) => row.selected && !row.disabled) ?? rows.find((row) => !row.disabled) ?? null;
  return { ...indexed, rows, rowById: new Map(rows.map((row) => [row.node.id, row])), defaultActive };
}

export function flattenTree(nodes, options) {
  return visibleModel(nodes, options).rows;
}

export function getWindow({ count, rowHeight, height, scrollTop = 0, overscan = 5 }) {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('count must be a nonnegative safe integer.');
  if (!Number.isFinite(rowHeight) || rowHeight <= 0 || !Number.isFinite(height) || height <= 0) throw new RangeError('height and rowHeight must be positive finite numbers.');
  if (!Number.isSafeInteger(overscan) || overscan < 0) throw new RangeError('overscan must be a nonnegative safe integer.');
  if (!Number.isFinite(scrollTop)) throw new RangeError('scrollTop must be finite.');
  const totalHeight = count * rowHeight;
  if (!Number.isSafeInteger(Math.ceil(totalHeight))) throw new RangeError('Total tree height exceeds the supported numeric range.');
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, totalHeight - height)));
  return {
    start: Math.max(0, Math.floor(top / rowHeight) - overscan),
    end: Math.min(count, Math.ceil((top + height) / rowHeight) + overscan),
    totalHeight, scrollTop: top,
  };
}

function replaceEntry(nodes, indexed, entry, replacement) {
  let current = entry;
  let next = replacement;
  while (current.parentIndex >= 0) {
    const parent = indexed.entries[current.parentIndex];
    const children = parent.node.children.slice();
    if (next === null) children.splice(current.position - 1, 1);
    else children[current.position - 1] = next;
    next = { ...parent.node, children };
    current = parent;
  }
  const result = nodes.slice();
  if (next === null) result.splice(current.position - 1, 1);
  else result[current.position - 1] = next;
  return result;
}

export function updateNode(nodes, id, update) {
  const indexed = indexTree(nodes);
  const entry = indexed.byId.get(id);
  if (!entry) return nodes;
  const next = typeof update === 'function' ? update(entry.node) : { ...entry.node, ...update };
  if (!next || next.id !== id) throw new TypeError('Node updates must preserve the node id.');
  if (next === entry.node) return nodes;
  return replaceEntry(nodes, indexed, entry, next);
}

export function removeNode(nodes, id) {
  const indexed = indexTree(nodes);
  const entry = indexed.byId.get(id);
  return entry ? replaceEntry(nodes, indexed, entry, null) : nodes;
}

export function mapTree(nodes, mapper) {
  const { entries } = indexTree(nodes);
  const mapped = new Map();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const { node } = entries[index];
    let next = node;
    if (node.children) {
      const children = node.children.map((child) => mapped.get(child.id));
      if (children.some((child, position) => child !== node.children[position])) next = { ...node, children };
    }
    const updated = mapper(next);
    if (!updated || updated.id !== node.id) throw new TypeError('Mapped nodes must preserve their ids.');
    mapped.set(node.id, updated);
  }
  const result = nodes.map((node) => mapped.get(node.id));
  return result.every((node, position) => node === nodes[position]) ? nodes : result;
}

export function filterTree(nodes, predicate) {
  const { entries } = indexTree(nodes);
  const included = includedEntries(entries, predicate);
  const mapped = new Map();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (!included.has(index)) continue;
    const node = entries[index].node;
    const children = (node.children ?? []).filter((child) => mapped.has(child.id)).map((child) => mapped.get(child.id));
    const next = { ...node };
    if (node.children) next.children = children;
    if (children.length) next.state = { ...node.state, expanded: true };
    mapped.set(node.id, next);
  }
  return nodes.filter((node) => mapped.has(node.id)).map((node) => mapped.get(node.id));
}

export function setSelection(nodes, ids) {
  const selected = new Set(ids);
  return mapTree(nodes, (node) => {
    const value = selected.has(node.id);
    return Boolean(node.state?.selected) === value ? node : { ...node, state: { ...node.state, selected: value } };
  });
}