'use client';

import { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Hash,
  Braces,
  Type,
  List,
  ToggleLeft,
  Search,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface VariableInspectorProps {
  variables: Record<string, unknown>;
  stepOutputs: Record<string, unknown>;
  currentStep?: string;
  className?: string;
}

type ValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'undefined';

interface TreeNode {
  key: string;
  value: unknown;
  type: ValueType;
  path: string;
  children?: TreeNode[];
}

function getValueType(value: unknown): ValueType {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value as ValueType;
}

function buildTree(obj: unknown, path: string = ''): TreeNode[] {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== 'object') return [];

  return Object.entries(obj as Record<string, unknown>).map(([key, value]) => {
    const nodePath = path ? `${path}.${key}` : key;
    const type = getValueType(value);

    const node: TreeNode = {
      key,
      value,
      type,
      path: nodePath,
    };

    if (type === 'object' || type === 'array') {
      node.children = buildTree(value, nodePath);
    }

    return node;
  });
}

function TreeNodeView({
  node,
  depth = 0,
  expanded,
  onToggle,
  onCopy,
}: {
  node: TreeNode;
  depth?: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onCopy: (value: unknown) => void;
}) {
  const isExpanded = expanded.has(node.path);
  const hasChildren = node.children && node.children.length > 0;
  const isExpandable = node.type === 'object' || node.type === 'array';

  const TypeIcon = () => {
    switch (node.type) {
      case 'string':
        return <Type className="w-3 h-3 text-green-500" />;
      case 'number':
        return <Hash className="w-3 h-3 text-blue-500" />;
      case 'boolean':
        return <ToggleLeft className="w-3 h-3 text-purple-500" />;
      case 'array':
        return <List className="w-3 h-3 text-orange-500" />;
      case 'object':
        return <Braces className="w-3 h-3 text-cyan-500" />;
      default:
        return null;
    }
  };

  const formatValue = (value: unknown, type: ValueType): string => {
    switch (type) {
      case 'string':
        const str = value as string;
        return str.length > 50 ? `"${str.substring(0, 50)}..."` : `"${str}"`;
      case 'number':
      case 'boolean':
        return String(value);
      case 'null':
        return 'null';
      case 'undefined':
        return 'undefined';
      case 'array':
        return `Array(${(value as unknown[]).length})`;
      case 'object':
        return `Object(${Object.keys(value as object).length})`;
      default:
        return String(value);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-0.5 px-1 rounded hover:bg-muted/50 group',
          'cursor-pointer select-none'
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => isExpandable && onToggle(node.path)}
      >
        {isExpandable ? (
          isExpanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <TypeIcon />
        <span className="text-xs font-mono text-foreground">{node.key}</span>
        <span className="text-muted-foreground text-xs">:</span>
        <span
          className={cn(
            'text-xs font-mono truncate',
            node.type === 'string' && 'text-green-600 dark:text-green-400',
            node.type === 'number' && 'text-blue-600 dark:text-blue-400',
            node.type === 'boolean' && 'text-purple-600 dark:text-purple-400',
            (node.type === 'null' || node.type === 'undefined') && 'text-muted-foreground italic'
          )}
        >
          {formatValue(node.value, node.type)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(node.value);
          }}
          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 ml-auto"
        >
          <Copy className="w-3 h-3" />
        </Button>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeView
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onCopy={onCopy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function VariableInspector({
  variables,
  stepOutputs,
  currentStep,
  className,
}: VariableInspectorProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const variableTree = useMemo(() => buildTree(variables), [variables]);
  const outputTree = useMemo(() => buildTree(stepOutputs), [stepOutputs]);

  // Filter tree based on search
  const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;

    return nodes.filter((node) => {
      const matchesKey = node.key.toLowerCase().includes(query.toLowerCase());
      const matchesValue = String(node.value).toLowerCase().includes(query.toLowerCase());

      if (matchesKey || matchesValue) return true;

      if (node.children) {
        const filteredChildren = filterTree(node.children, query);
        if (filteredChildren.length > 0) {
          // Auto-expand matching branches
          setExpanded((prev) => new Set([...prev, node.path]));
          return true;
        }
      }

      return false;
    });
  };

  const filteredVariables = useMemo(
    () => filterTree(variableTree, search),
    [variableTree, search]
  );

  const filteredOutputs = useMemo(
    () => filterTree(outputTree, search),
    [outputTree, search]
  );

  const handleToggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCopy = async (value: unknown) => {
    try {
      const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore copy errors
    }
  };

  const expandAll = () => {
    const allPaths = new Set<string>();
    const collect = (nodes: TreeNode[]) => {
      nodes.forEach((node) => {
        if (node.children) {
          allPaths.add(node.path);
          collect(node.children);
        }
      });
    };
    collect(variableTree);
    collect(outputTree);
    setExpanded(allPaths);
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Search */}
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variables..."
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="ghost" size="sm" onClick={expandAll} className="h-6 text-[10px] px-2">
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll} className="h-6 text-[10px] px-2">
            Collapse All
          </Button>
          {copied && (
            <span className="flex items-center gap-1 text-[10px] text-green-600 ml-auto">
              <Check className="w-3 h-3" />
              Copied!
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <Tabs defaultValue="variables" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b px-2 h-8">
          <TabsTrigger value="variables" className="text-xs h-6">
            Variables
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({Object.keys(variables).length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="outputs" className="text-xs h-6">
            Step Outputs
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({Object.keys(stepOutputs).length})
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="variables" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-2">
              {filteredVariables.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Braces className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No variables</p>
                </div>
              ) : (
                filteredVariables.map((node) => (
                  <TreeNodeView
                    key={node.path}
                    node={node}
                    expanded={expanded}
                    onToggle={handleToggle}
                    onCopy={handleCopy}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="outputs" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-2">
              {filteredOutputs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <List className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No step outputs yet</p>
                  <p className="text-[10px] mt-1">
                    Outputs appear as steps complete
                  </p>
                </div>
              ) : (
                filteredOutputs.map((node) => (
                  <TreeNodeView
                    key={node.path}
                    node={node}
                    expanded={expanded}
                    onToggle={handleToggle}
                    onCopy={handleCopy}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
