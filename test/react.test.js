import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as element, createRef, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import Tree, { FilteringContainer } from '../src/index.js';

let dom;
let root;
let container;
const originals = new Map();

function replace(name, value) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

beforeEach(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>');
  replace('window', dom.window);
  replace('document', dom.window.document);
  replace('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.getElementById('root');
  root = createRoot(container);
});

afterEach(async () => {
  replace('window', dom.window);
  replace('document', dom.window.document);
  await act(() => root.unmount());
  dom.window.close();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  originals.clear();
});

const render = (content) => act(() => root.render(content));
const rows = () => [...container.querySelectorAll('[role="treeitem"]')];
const tree = () => container.querySelector('[role="tree"]');
const click = (node, options) => act(() => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ...options })));
const key = (name, options) => act(() => tree().dispatchEvent(new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options })));
const active = () => document.getElementById(tree().getAttribute('aria-activedescendant'));
const sample = () => [
  { id: 'root', name: 'Root', children: [
    { id: 'alpha', name: 'Alpha' },
    { id: 'disabled', name: 'Disabled', state: { disabled: true } },
    { id: 'beta', name: 'Beta' },
  ] },
  { id: 'last', name: 'Last' },
];

test('virtualizes 10,000 rows and renders only viewport, overscan and active row', async () => {
  const nodes = Array.from({ length: 10000 }, (_, id) => ({ id, name: `Item ${id}` }));
  await render(element(Tree, { nodes, height: 200, rowHeight: 20, overscan: 2 }));
  assert.equal(rows().length, 12);
  await act(() => { tree().scrollTop = 5000; tree().dispatchEvent(new window.Event('scroll', { bubbles: true })); });
  assert.ok(rows().length <= 15);
  assert.ok(rows().some((row) => row.textContent === 'Item 250'));
  assert.ok(active());
  assert.equal(tree().firstChild.style.height, '200000px');
});

test('uncontrolled expansion preserves state, exposes ARIA and skips disabled nodes', async () => {
  await render(element(Tree, { defaultNodes: sample() }));
  assert.equal(rows().length, 2);
  assert.equal(rows()[0].getAttribute('aria-expanded'), 'false');
  await key('ArrowRight');
  assert.equal(rows().length, 5);
  assert.equal(rows()[1].getAttribute('aria-level'), '2');
  assert.equal(rows()[3].getAttribute('aria-posinset'), '3');
  await key('ArrowRight');
  assert.equal(active().textContent, 'Alpha');
  await key('ArrowDown');
  assert.equal(active().textContent, 'Beta');
  await key('ArrowLeft');
  assert.equal(active().getAttribute('aria-expanded'), 'true');
  await key('ArrowLeft');
  assert.equal(rows().length, 2);
});

test('controlled nodes emit immutable changes and respond when owner updates them', async () => {
  const original = sample();
  const changes = [];
  function Consumer() {
    const [nodes, setNodes] = useState(original);
    return element(Tree, { nodes, onChange: (next, change) => { changes.push(change); setNodes(next); } });
  }
  await render(element(Consumer));
  await click(container.querySelector('button'));
  assert.equal(rows().length, 5);
  assert.equal(changes[0].type, 'expand');
  assert.equal(original[0].state, undefined);
  await click(rows()[1]);
  assert.equal(rows()[1].getAttribute('aria-selected'), 'true');
  assert.equal(changes[1].type, 'select');
});

test('multiple selection supports control toggles, shift ranges, checkboxes and select all', async () => {
  const nodes = sample();
  nodes[0].state = { expanded: true };
  const selected = [];
  await render(element(Tree, { defaultNodes: nodes, selectionMode: 'multiple', showCheckboxes: true, onSelectionChange: (ids) => selected.push(ids) }));
  await click(rows()[1]);
  await click(rows()[3], { shiftKey: true });
  assert.deepEqual(selected.at(-1), ['alpha', 'beta']);
  await click(rows()[4], { ctrlKey: true });
  assert.deepEqual(selected.at(-1), ['alpha', 'beta', 'last']);
  await click(rows()[1].querySelector('input'));
  assert.deepEqual(selected.at(-1), ['beta', 'last']);
  await key('a', { ctrlKey: true });
  assert.deepEqual(selected.at(-1), ['root', 'alpha', 'beta', 'last']);
  assert.equal(tree().getAttribute('aria-multiselectable'), 'true');
});

test('imperative focus, scrolling, end/home and typeahead keep active descendants mounted', async () => {
  const ref = createRef();
  const nodes = Array.from({ length: 100 }, (_, id) => ({ id, name: id === 60 ? 'Zebra' : `Item ${id}` }));
  await render(element(Tree, { ref, nodes, height: 100, rowHeight: 20, overscan: 1 }));
  await act(() => assert.equal(ref.current.scrollToId(50, { align: 'start' }), true));
  assert.equal(tree().scrollTop, 1000);
  await act(() => ref.current.focus(60));
  assert.equal(active().textContent, 'Zebra');
  await key('End');
  assert.equal(active().textContent, 'Item 99');
  await key('Home');
  assert.equal(active().textContent, 'Item 0');
  await key('z');
  assert.equal(active().textContent, 'Zebra');
  assert.equal(ref.current.scrollToId('unknown'), false);
  assert.equal(ref.current.getVisibleNodes().length, 100);
});

test('custom renderers get actions and user state is retained', async () => {
  await render(element(Tree, { defaultNodes: [{ id: 'one', name: 'One', payload: 42 }] }, (props) => element('button', { type: 'button', onClick: () => props.update({ name: 'Changed' }) }, `${props.node.name}:${props.node.payload}:${props.depth}`)));
  assert.equal(rows()[0].textContent, 'One:42:0');
  await click(rows()[0].querySelector('button'));
  assert.equal(rows()[0].textContent, 'Changed:42:0');
});

test('direct filtering reveals ancestors, empty results render status and shrinking trees clamp scroll', async () => {
  const nodes = sample();
  await render(element(Tree, { nodes, filter: (node) => node.name === 'Beta' }));
  assert.deepEqual(rows().map((row) => row.textContent), ['-Root', 'Beta']);
  assert.equal(rows()[1].getAttribute('aria-setsize'), '1');
  await render(element(Tree, { nodes, filter: () => false, emptyContent: 'Nothing found' }));
  assert.equal(rows().length, 0);
  assert.equal(container.querySelector('[role="status"]').textContent, 'Nothing found');
  await render(element(Tree, { nodes: Array.from({ length: 100 }, (_, id) => ({ id, name: `Item ${id}` })), height: 100, rowHeight: 20 }));
  await act(() => { tree().scrollTop = 1500; tree().dispatchEvent(new window.Event('scroll', { bubbles: true })); });
  await render(element(Tree, { nodes: [{ id: 'only', name: 'Only' }], height: 100, rowHeight: 20 }));
  assert.equal(tree().scrollTop, 0);
  assert.equal(active().textContent, 'Only');
});

test('FilteringContainer supports controlled and default search while preserving original nodes', async () => {
  const nodes = sample();
  const content = (filtered) => element(Tree, { nodes: filtered.nodes });
  await render(element(FilteringContainer, { nodes, defaultSearch: 'Beta' }, content));
  assert.equal(container.querySelector('input[type="search"]').value, 'Beta');
  assert.equal(rows().length, 2);
  assert.equal(nodes[0].state, undefined);
  await render(element(FilteringContainer, { nodes, search: 'Last' }, content));
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].textContent, 'Last');
});

test('SSR requires no browser globals and StrictMode unmount is clean', async () => {
  replace('window', undefined);
  replace('document', undefined);
  const html = renderToString(element(Tree, { nodes: sample(), height: 100 }));
  assert.match(html, /role="tree"/);
  assert.match(html, /aria-expanded="false"/);
  replace('window', dom.window);
  replace('document', dom.window.document);
  await render(element(StrictMode, null, element(Tree, { defaultNodes: sample() })));
  await render(null);
  assert.equal(container.childNodes.length, 0);
});

test('filtered edits update the original tree without dropping hidden branches or hidden multi-selection', async () => {
  const original = sample();
  original[1].state = { selected: true };
  let latest;
  function Consumer() {
    const [nodes, setNodes] = useState(original);
    latest = nodes;
    return element(FilteringContainer, { nodes, search: 'Alpha', onChange: setNodes }, ({ nodes: filtered, onChange }) => element(Tree, { nodes: filtered, onChange, selectionMode: 'multiple' }));
  }
  await render(element(Consumer));
  await click(rows()[1]);
  assert.equal(latest.length, 2);
  assert.equal(latest[0].children.length, 3);
  assert.equal(latest[0].children[0].state.selected, true);
  assert.equal(latest[1].state.selected, true);
  assert.equal(latest[0].state, undefined);
});

test('keyboard shift selection establishes an anchor and repeated typeahead cycles matches', async () => {
  await render(element(Tree, { defaultNodes: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Alpine' }, { id: 'c', name: 'Beta' }], selectionMode: 'multiple' }));
  await key('ArrowDown', { shiftKey: true });
  assert.equal(rows()[0].getAttribute('aria-selected'), 'true');
  assert.equal(rows()[1].getAttribute('aria-selected'), 'true');
  await key('a');
  assert.equal(active().textContent, 'Alpha');
  await key('a');
  assert.equal(active().textContent, 'Alpine');
});

test('DOM ids support arbitrary nonempty strings and distinguish numeric ids', async () => {
  await render(element(Tree, { nodes: [{ id: 1, name: 'Number' }, { id: '1', name: 'String' }, { id: '\ud800 a/b', name: 'Unusual' }] }));
  assert.equal(new Set(rows().map((row) => row.id)).size, 3);
  await key('End');
  assert.equal(active().textContent, 'Unusual');
});