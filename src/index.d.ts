import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode, RefAttributes } from 'react';

export type NodeId = string | number;
export type SelectionMode = 'none' | 'single' | 'multiple';
export interface TreeNodeState {
  expanded?: boolean;
  selected?: boolean;
  disabled?: boolean;
  loading?: boolean;
  [key: string]: unknown;
}
export interface TreeNode {
  id: NodeId;
  name?: string;
  children?: readonly TreeNode[];
  hasChildren?: boolean;
  state?: TreeNodeState;
}
export type NodeUpdate<T extends TreeNode> = Partial<T> | ((node: T) => T);
export interface FlatNode<T extends TreeNode = TreeNode> {
  node: T;
  depth: number;
  deepness: number;
  parentId: NodeId | null;
  position: number;
  setSize: number;
  index: number;
  isLeaf: boolean;
  expanded: boolean;
  selected: boolean;
  disabled: boolean;
}
export interface SelectionModifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}
export interface NodeRendererProps<T extends TreeNode = TreeNode> extends FlatNode<T> {
  active: boolean;
  showCheckboxes: boolean;
  selectionMode: SelectionMode;
  toggleExpanded: () => void;
  toggleSelected: () => void;
  select: (event?: SelectionModifiers) => void;
  update: (patch: NodeUpdate<T>) => void;
}
export type TreeChange<T extends TreeNode = TreeNode> =
  | { type: 'expand'; node: T; expanded: boolean }
  | { type: 'select'; node: T; selectedIds: NodeId[]; selectionMode: 'single' | 'multiple' }
  | { type: 'update'; node: T; update: NodeUpdate<T> };
export type TreeChangeHandler<T extends TreeNode> = (nodes: T[], change: TreeChange<T>) => void;
export type RowRenderer<T extends TreeNode> = (props: NodeRendererProps<T>) => ReactNode;
export interface ScrollOptions { align?: 'auto' | 'start' | 'center' | 'end' }
export interface TreeHandle<T extends TreeNode = TreeNode> {
  focus: (id?: NodeId) => boolean;
  scrollToId: (id: NodeId, options?: ScrollOptions) => boolean;
  scrollToIndex: (index: number, options?: ScrollOptions) => boolean;
  getVisibleNodes: () => FlatNode<T>[];
}
export interface TreeProps<T extends TreeNode = TreeNode> extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange' | 'onSelect' | 'onToggle'> {
  nodes?: readonly T[];
  defaultNodes?: readonly T[];
  onChange?: TreeChangeHandler<T>;
  onToggle?: (node: T, expanded: boolean) => void;
  onSelectionChange?: (selectedIds: NodeId[], node: T) => void;
  height?: number;
  width?: CSSProperties['width'];
  rowHeight?: number;
  overscan?: number;
  indent?: number;
  selectionMode?: SelectionMode;
  showCheckboxes?: boolean;
  filter?: (node: T) => boolean;
  children?: RowRenderer<T>;
  renderNode?: RowRenderer<T>;
  rowClassName?: string | ((props: NodeRendererProps<T>) => string | undefined);
  rowStyle?: CSSProperties | ((props: NodeRendererProps<T>) => CSSProperties | undefined);
  emptyContent?: ReactNode;
}
export function Tree<T extends TreeNode = TreeNode>(props: TreeProps<T> & RefAttributes<TreeHandle<T>>): ReactElement;
export default Tree;
export type DecoratorProps<T extends TreeNode = TreeNode> = NodeRendererProps<T> & { children?: ReactNode };
export function Expandable<T extends TreeNode = TreeNode>(props: DecoratorProps<T>): ReactElement;
export function Selectable<T extends TreeNode = TreeNode>(props: DecoratorProps<T>): ReactElement;
export function NodeRenderer<T extends TreeNode = TreeNode>(props: NodeRendererProps<T>): ReactElement;
export const renderers: Readonly<{ Expandable: typeof Expandable; Selectable: typeof Selectable; NodeRenderer: typeof NodeRenderer }>;
export interface FilteringRenderProps<T extends TreeNode> {
  nodes: readonly T[];
  onChange: TreeChangeHandler<T>;
  search: string;
  setSearch: (search: string) => void;
}
export interface FilteringContainerProps<T extends TreeNode = TreeNode> {
  nodes: readonly T[];
  onChange?: TreeChangeHandler<T>;
  children: (props: FilteringRenderProps<T>) => ReactNode;
  search?: string;
  defaultSearch?: string;
  onSearchChange?: (search: string) => void;
  predicate?: (node: T, query: string) => boolean;
  searchLabel?: string;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}
export function FilteringContainer<T extends TreeNode = TreeNode>(props: FilteringContainerProps<T>): ReactElement;
export function flattenTree<T extends TreeNode>(nodes: readonly T[], options?: { filter?: (node: T) => boolean }): FlatNode<T>[];
export function updateNode<T extends TreeNode>(nodes: readonly T[], id: NodeId, update: NodeUpdate<T>): T[];
export function removeNode<T extends TreeNode>(nodes: readonly T[], id: NodeId): T[];
export function mapTree<T extends TreeNode>(nodes: readonly T[], mapper: (node: T) => T): T[];
export function filterTree<T extends TreeNode>(nodes: readonly T[], predicate: (node: T) => boolean): T[];
export function setSelection<T extends TreeNode>(nodes: readonly T[], ids: Iterable<NodeId>): T[];
export interface WindowOptions { count: number; height: number; rowHeight: number; scrollTop?: number; overscan?: number }
export function getWindow(options: WindowOptions): { start: number; end: number; totalHeight: number; scrollTop: number };