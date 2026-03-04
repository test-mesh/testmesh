'use client';

import { useState, useMemo } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// Collect all descendant IDs of a node (including the node itself)
function getDescendantIds(node: CollectionTreeNode): Set<string> {
  const ids = new Set<string>([node.id]);
  if (node.children) {
    for (const child of node.children) {
      for (const id of getDescendantIds(child)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

// Find a node by ID in the tree
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

// Filter tree to exclude specific IDs and only show collections
function filterTreeForMove(
  nodes: CollectionTreeNode[],
  excludeIds: Set<string>
): CollectionTreeNode[] {
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

function TreePickerNode({
  node,
  depth,
  selectedId,
  expandedIds,
  onToggleExpand,
  onSelect,
}: TreePickerNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
          'hover:bg-muted/50',
          isSelected && 'bg-primary/10 text-primary ring-1 ring-primary/20'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {/* Expand/Collapse arrow */}
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className="hover:bg-muted rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        {/* Icon */}
        <div
          className="w-4 h-4 shrink-0"
          style={node.color ? { color: node.color } : undefined}
        >
          {isExpanded ? (
            <FolderOpen className="w-4 h-4" />
          ) : (
            <Folder className="w-4 h-4" />
          )}
        </div>

        {/* Emoji icon if set */}
        {node.icon && <span className="text-sm">{node.icon}</span>}

        {/* Name */}
        <span className="flex-1 truncate text-sm">{node.name}</span>
      </div>

      {/* Children */}
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
  // null = root level, string = specific parent
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    tree.forEach((node) => initial.add(node.id));
    return initial;
  });

  // Filter tree to exclude the collection being moved and its descendants
  const filteredTree = useMemo(() => {
    const nodeToMove = findNodeById(tree, collectionId);
    if (!nodeToMove) return tree.filter((n) => n.type === 'collection');

    const excludeIds = getDescendantIds(nodeToMove);
    return filterTreeForMove(tree, excludeIds);
  }, [tree, collectionId]);

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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
          {/* Root level option */}
          <div
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
              'hover:bg-muted/50',
              isRootSelected && 'bg-primary/10 text-primary ring-1 ring-primary/20'
            )}
            onClick={() => setSelectedParentId(null)}
          >
            <Home className="w-4 h-4" />
            <span className="text-sm font-medium">Root (Top Level)</span>
          </div>

          {/* Tree */}
          <div className="mt-2 max-h-[300px] overflow-auto border rounded-md p-1">
            {filteredTree.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4">
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Moving...' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
