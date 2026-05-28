'use client';

import { useState, useMemo } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Home } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { CollectionTreeNode } from '@/lib/api/types';

interface MoveCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  collectionName: string;
  tree: CollectionTreeNode[];
  onMove: (targetParentId: string | null) => Promise<void>;
  isLoading?: boolean;
}

function getDescendantIds(node: CollectionTreeNode): Set<string> {
  const ids = new Set<string>([node.id]);
  if (node.children) {
    for (const child of node.children) {
      for (const id of getDescendantIds(child)) ids.add(id);
    }
  }
  return ids;
}

function findNodeById(nodes: CollectionTreeNode[], id: string): CollectionTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function filterTreeForMove(nodes: CollectionTreeNode[], excludeIds: Set<string>): CollectionTreeNode[] {
  return nodes
    .filter((node) => node.type === 'collection' && !excludeIds.has(node.id))
    .map((node) => ({
      ...node,
      children: node.children ? filterTreeForMove(node.children, excludeIds) : undefined,
    }));
}

interface TreePickerNodeProps {
  node: CollectionTreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
}

function TreePickerNode({ node, depth, selectedId, expandedIds, onToggleExpand, onSelect }: TreePickerNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
          'hover:bg-[#131b26]',
          isSelected && 'bg-teal-400/5 ring-1 ring-teal-400/20'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
              className="hover:bg-[#1a2d3d] rounded"
            >
              {isExpanded
                ? <ChevronDown className="w-3 h-3 text-[#4a6480]" />
                : <ChevronRight className="w-3 h-3 text-[#4a6480]" />}
            </button>
          )}
        </div>

        <div className="w-4 h-4 shrink-0" style={node.color ? { color: node.color } : undefined}>
          {isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
        </div>

        {node.icon && <span className="text-sm">{node.icon}</span>}

        <span className={cn('flex-1 truncate text-xs', isSelected ? 'text-teal-400' : 'text-[#c8dce8]')}>
          {node.name}
        </span>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreePickerNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MoveCollectionDialog({
  open,
  onOpenChange,
  collectionId,
  collectionName,
  tree,
  onMove,
  isLoading,
}: MoveCollectionDialogProps) {
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    tree.forEach((node) => initial.add(node.id));
    return initial;
  });

  const filteredTree = useMemo(() => {
    const nodeToMove = findNodeById(tree, collectionId);
    if (!nodeToMove) return tree.filter((n) => n.type === 'collection');
    const excludeIds = getDescendantIds(nodeToMove);
    return filterTreeForMove(tree, excludeIds);
  }, [tree, collectionId]);

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleSubmit = async () => {
    await onMove(selectedParentId);
    onOpenChange(false);
  };

  const isRootSelected = selectedParentId === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Move Collection</DialogTitle>
          <DialogDescription>
            Choose a new location for &quot;{collectionName}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
              'hover:bg-[#131b26]',
              isRootSelected && 'bg-teal-400/5 ring-1 ring-teal-400/20'
            )}
            onClick={() => setSelectedParentId(null)}
          >
            <Home className={cn('w-4 h-4', isRootSelected ? 'text-teal-400' : 'text-[#4a6480]')} />
            <span className={cn('text-xs font-medium', isRootSelected ? 'text-teal-400' : 'text-[#c8dce8]')}>
              Root (Top Level)
            </span>
          </div>

          <div className="mt-2 max-h-[300px] overflow-auto border border-[#1e2d3d] rounded-lg bg-[#0f1923] p-1">
            {filteredTree.length === 0 ? (
              <div className="text-center text-xs text-[#4a6480] py-4">
                No other collections available
              </div>
            ) : (
              filteredTree.map((node) => (
                <TreePickerNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedParentId}
                  expandedIds={expandedIds}
                  onToggleExpand={handleToggleExpand}
                  onSelect={setSelectedParentId}
                />
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex items-center h-8 px-4 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex items-center h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Moving...' : 'Move'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
