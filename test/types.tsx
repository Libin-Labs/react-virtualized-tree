import { createRef, useState } from 'react';
import Tree, { Expandable, FilteringContainer, Selectable, flattenTree, updateNode, type TreeHandle, type TreeNode } from '../src/index.js';

interface Item extends TreeNode {
  name: string;
  payload: number;
  children?: Item[];
}

export function Consumer() {
  const [nodes, setNodes] = useState<Item[]>([{ id: 1, name: 'Root', payload: 42, children: [] }]);
  const ref = createRef<TreeHandle<Item>>();
  const direct = <Tree<Item> ref={ref} nodes={nodes} onChange={setNodes} height={300} selectionMode="multiple" showCheckboxes>
    {(props) => <Expandable {...props}><Selectable {...props}>{props.node.name}: {props.node.payload}</Selectable></Expandable>}
  </Tree>;
  const filtered = <FilteringContainer nodes={nodes} onChange={setNodes}>
    {({ nodes: filteredNodes, onChange }) => <Tree nodes={filteredNodes} onChange={onChange} />}
  </FilteringContainer>;
  ref.current?.scrollToId(1, { align: 'center' });
  const changed: Item[] = updateNode(nodes, 1, { payload: 43 });
  const payload: number = flattenTree(changed)[0].node.payload;
  // @ts-expect-error Rows must have a fixed numeric height.
  const invalidHeight = <Tree nodes={nodes} rowHeight="auto" />;
  // @ts-expect-error Selection modes are restricted to supported modes.
  const invalidMode = <Tree nodes={nodes} selectionMode="checkbox" />;
  return <>{direct}{filtered}{payload}{invalidHeight}{invalidMode}</>;
}
