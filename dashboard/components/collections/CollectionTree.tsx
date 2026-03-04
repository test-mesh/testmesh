'use client';

import { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Move,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CollectionTreeNode } from '@/lib/api/types';

interface CollectionTreeProps {
  tree: CollectionTreeNode[];
  selectedId?: string;
  onSelect?: (node: CollectionTreeNode) => void;
  onCreateCollection?: (parentId?: string) => void;
  onEditCollection?: (id: string) => void;
  onDeleteCollection?: (id: string) => void;
  onDuplicateCollection?: (id: string) => void;
  onMoveCollection?: (id: string) => void;
  onRunFlow?: (flowId: string) => void;
  onEditFlow?: (flowId: string) => void;
  onDeleteFlow?: (flowId: string) => void;
  className?: string;
}

interface TreeNodeProps {
  node: CollectionTreeNode;
  depth: number;
  selectedId?: string;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect?: (node: CollectionTreeNode) => void;
  onCreateCollection?: (parentId?: string) => void;
  onEditCollection?: (id: string) => void;
  onDeleteCollection?: (id: string) => void;
  onDuplicateCollection?: (id: string) => void;
  onMoveCollection?: (id: string) => void;
  onRunFlow?: (flowId: string) => void;
  onEditFlow?: (flowId: string) => void;
  onDeleteFlow?: (flowId: string) => void;
}

// Get icon color based on collection color
function getIconColor(color?: string): string {
  if (!color) return 'text-muted-foreground';
  return ''; // Let the color prop handle it
}

// TreeNode component
function TreeNode({
  node,
  depth,
  selectedId,
  expandedIds,
  onToggleExpand,
  onSelect,
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
  onDuplicateCollection,
  onMoveCollection,
  onRunFlow,
  onEditFlow,
  onDeleteFlow,
}: TreeNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const isCollection = node.type === 'collection';

  const handleClick = () => {
    if (hasChildren) {
      onToggleExpand(node.id);
    }
    onSelect?.(node);
  };

  const handleDoubleClick = () => {
    if (node.type === 'flow' && node.flow_id) {
      onEditFlow?.(node.flow_id);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer transition-colors',
          'hover:bg-muted/50',
          isSelected && 'bg-primary/10 text-primary'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
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
          className={cn('w-4 h-4 shrink-0', getIconColor(node.color))}
          style={node.color ? { color: node.color } : undefined}
        >
          {isCollection ? (
            isExpanded ? (
              <FolderOpen className="w-4 h-4" />
            ) : (
              <Folder className="w-4 h-4" />
            )
          ) : (
            <FileText className="w-4 h-4" />
          )}
        </div>

        {/* Emoji icon if set */}
        {node.icon && <span className="text-sm">{node.icon}</span>}

        {/* Name */}
        <span className="flex-1 truncate text-sm">{node.name}</span>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isCollection ? (
              <>
                <DropdownMenuItem onClick={() => onCreateCollection?.(node.id)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Sub-Collection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEditCollection?.(node.id)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Collection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicateCollection?.(node.id)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMoveCollection?.(node.id)}>
                  <Move className="w-4 h-4 mr-2" />
                  Move
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteCollection?.(node.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={() => node.flow_id && onRunFlow?.(node.flow_id)}>
                  <Play className="w-4 h-4 mr-2" />
                  Run Flow
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => node.flow_id && onEditFlow?.(node.flow_id)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Flow
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => node.flow_id && onDeleteFlow?.(node.flow_id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove from Collection
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onCreateCollection={onCreateCollection}
              onEditCollection={onEditCollection}
              onDeleteCollection={onDeleteCollection}
              onDuplicateCollection={onDuplicateCollection}
              onMoveCollection={onMoveCollection}
              onRunFlow={onRunFlow}
              onEditFlow={onEditFlow}
              onDeleteFlow={onDeleteFlow}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CollectionTree({
  tree,
  selectedId,
  onSelect,
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
  onDuplicateCollection,
  onMoveCollection,
  onRunFlow,
  onEditFlow,
  onDeleteFlow,
  className,
}: CollectionTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Auto-expand first level
    const initial = new Set<string>();
    tree.forEach((node) => initial.add(node.id));
    return initial;
  });

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    const collectIds = (nodes: CollectionTreeNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'collection') {
          allIds.add(node.id);
        }
        if (node.children) {
          collectIds(node.children);
        }
      });
    };
    collectIds(tree);
    setExpandedIds(allIds);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  if (tree.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
        <Folder className="w-12 h-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground mb-4">No collections yet</p>
        <Button variant="outline" size="sm" onClick={() => onCreateCollection?.()}>
          <Plus className="w-4 h-4 mr-2" />
          Create Collection
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b">
        <span className="text-xs font-medium text-muted-foreground">Collections</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={expandAll}>
            Expand
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={collapseAll}>
            Collapse
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => onCreateCollection?.()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto py-1">
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            onSelect={onSelect}
            onCreateCollection={onCreateCollection}
            onEditCollection={onEditCollection}
            onDeleteCollection={onDeleteCollection}
            onDuplicateCollection={onDuplicateCollection}
            onMoveCollection={onMoveCollection}
            onRunFlow={onRunFlow}
            onEditFlow={onEditFlow}
            onDeleteFlow={onDeleteFlow}
          />
        ))}
      </div>
    </div>
  );
}
