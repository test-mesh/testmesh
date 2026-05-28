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
    if (hasChildren) onToggleExpand(node.id);
    onSelect?.(node);
  };

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer transition-colors',
          'hover:bg-[#131b26]',
          isSelected && 'bg-teal-400/5 text-teal-400'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={() => node.type === 'flow' && node.flow_id && onEditFlow?.(node.flow_id)}
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
          {isCollection
            ? isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />
            : <FileText className="w-4 h-4 text-[#4a6480]" />}
        </div>

        {node.icon && <span className="text-sm">{node.icon}</span>}

        <span className="flex-1 truncate text-xs text-[#c8dce8]">{node.name}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center h-6 w-6 rounded opacity-0 group-hover:opacity-100 text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
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
    const initial = new Set<string>();
    tree.forEach((node) => initial.add(node.id));
    return initial;
  });

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    const collectIds = (nodes: CollectionTreeNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'collection') allIds.add(node.id);
        if (node.children) collectIds(node.children);
      });
    };
    collectIds(tree);
    setExpandedIds(allIds);
  }, [tree]);

  const collapseAll = useCallback(() => setExpandedIds(new Set()), []);

  if (tree.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
        <Folder className="w-12 h-12 text-[#3d5670] mb-4" />
        <p className="text-sm text-[#4a6480] mb-4">No collections yet</p>
        <button
          onClick={() => onCreateCollection?.()}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Collection
        </button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#1a2332]">
        <span className="text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Collections</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={expandAll}
            className="h-6 px-2 rounded text-[10px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          >
            Expand
          </button>
          <button
            onClick={collapseAll}
            className="h-6 px-2 rounded text-[10px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          >
            Collapse
          </button>
          <button
            onClick={() => onCreateCollection?.()}
            className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

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
