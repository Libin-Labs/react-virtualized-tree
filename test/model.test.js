import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTree, flattenTree, getWindow, indexTree, mapTree, removeNode, setSelection, updateNode } from '../src/model.js';

const sample = () => [
  { id: 'root', name: 'Root', state: { expanded: true }, children: [
    { id: 'folder', name: 'Folder', children: [{ id: 'leaf', name: 'Needle' }] },
    { id: 'other', name: 'Other' },
  ] },
  { id: 'last', name: 'Last' },
];

test('flattens expanded branches with depth, parents and sibling metadata', () => {
  const rows = flattenTree(sample());
  assert.deepEqual(rows.map(({ node }) => node.id), ['root', 'folder', 'other', 'last']);
  assert.equal(rows[1].depth, 1);
  assert.equal(rows[1].parentId, 'root');
  assert.equal(rows[1].setSize, 2);
  assert.equal(rows[2].position, 2);
  assert.equal(rows[1].isLeaf, false);
});

test('filters reveal matching descendants and ancestors without changing source state', () => {
  const nodes = sample();
  const predicate = (node) => node.name === 'Needle';
  assert.deepEqual(flattenTree(nodes, { filter: predicate }).map(({ node }) => node.id), ['root', 'folder', 'leaf']);
  const filtered = filterTree(nodes, predicate);
  assert.deepEqual(flattenTree(filtered).map(({ node }) => node.id), ['root', 'folder', 'leaf']);
  assert.equal(filtered[0].children[0].state.expanded, true);
  assert.equal(nodes[0].children[0].state, undefined);
  assert.deepEqual(filterTree(nodes, () => false), []);
});

test('immutable updates copy only ancestors, support removal and preserve unchanged trees', () => {
  const nodes = sample();
  const next = updateNode(nodes, 'leaf', (node) => ({ ...node, name: 'Changed' }));
  assert.equal(next[0].children[0].children[0].name, 'Changed');
  assert.equal(nodes[0].children[0].children[0].name, 'Needle');
  assert.equal(next[1], nodes[1]);
  assert.equal(next[0].children[1], nodes[0].children[1]);
  assert.equal(updateNode(nodes, 'unknown', {}), nodes);
  assert.equal(mapTree(nodes, (node) => node), nodes);
  assert.equal(removeNode(nodes, 'folder')[0].children.length, 1);
  assert.throws(() => updateNode(nodes, 'root', { id: 'new-id' }), /preserve/);
});

test('selection helpers update immutable states and preserve unrelated properties', () => {
  const nodes = sample();
  const next = setSelection(nodes, ['leaf']);
  assert.equal(next[0].children[0].children[0].state.selected, true);
  assert.equal(next[0].state.expanded, true);
  assert.equal(setSelection(next, ['leaf']), next);
});

test('windowing bounds row counts for 100,000 rows and clamps offsets', () => {
  const range = getWindow({ count: 100000, rowHeight: 32, height: 320, scrollTop: 160000, overscan: 3 });
  assert.equal(range.start, 4997);
  assert.equal(range.end, 5013);
  assert.equal(range.totalHeight, 3200000);
  assert.equal(getWindow({ count: 0, rowHeight: 32, height: 320 }).end, 0);
  assert.equal(getWindow({ count: 5, rowHeight: 32, height: 320, scrollTop: 999 }).scrollTop, 0);
  assert.throws(() => getWindow({ count: 1, rowHeight: 0, height: 320 }), RangeError);
  assert.throws(() => getWindow({ count: 1, rowHeight: 32, height: 320, overscan: -1 }), RangeError);
});

test('rejects duplicate ids, cycles and invalid nodes without recursive traversal', () => {
  assert.throws(() => indexTree([{ id: 1 }, { id: 1 }]), /Duplicate/);
  const cyclic = { id: 'cycle', children: [] };
  cyclic.children.push(cyclic);
  assert.throws(() => indexTree([cyclic]), /circular/);
  assert.throws(() => indexTree([{ id: '' }]), /id/);
  assert.throws(() => indexTree([{ id: 'bad', children: null }]), /array/);
  let nested = { id: 10000, name: 'Bottom' };
  for (let index = 9999; index >= 0; index -= 1) nested = { id: index, state: { expanded: true }, children: [nested] };
  assert.equal(flattenTree([nested]).length, 10001);
  assert.equal(updateNode([nested], 10000, { name: 'Updated' })[0].id, 0);
});