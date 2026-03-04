'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface JsonTreeViewProps {
  data: any;
  searchable?: boolean;
  defaultExpanded?: boolean;
  maxDepth?: number;
  className?: string;
}

// Get the type of a value for styling
function getValueType(value: any): 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

// Get color class for value type
function getValueColor(type: string): string {
  switch (type) {
    case 'string':
      return 'text-green-600 dark:text-green-400';
    case 'number':
      return 'text-blue-600 dark:text-blue-400';
    case 'boolean':
      return 'text-purple-600 dark:text-purple-400';
    case 'null':
      return 'text-gray-500 dark:text-gray-500';
    default:
      return '';
  }
}

// Render a single value
function ValueDisplay({ value, type }: { value: any; type: string }) {
  const colorClass = getValueColor(type);

  if (type === 'null') {
    return <span className={colorClass}>null</span>;
  }

  if (type === 'string') {
    return <span className={colorClass}>"{value}"</span>;
  }

  if (type === 'boolean') {
    return <span className={colorClass}>{value ? 'true' : 'false'}</span>;
  }

  return <span className={colorClass}>{String(value)}</span>;
}

// Tree node component
function TreeNode({
  name,
  value,
  depth,
  maxDepth,
  defaultExpanded,
  searchQuery,
  path,
  onCopyPath,
}: {
  name: string | number;
  value: any;
  depth: number;
  maxDepth: number;
  defaultExpanded: boolean;
  searchQuery: string;
  path: string;
  onCopyPath: (path: string, value: any) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(
    defaultExpanded && depth < 2 // Auto-expand first 2 levels
  );
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const type = getValueType(value);
  const isExpandable = type === 'object' || type === 'array';
  const isEmpty = isExpandable && Object.keys(value).length === 0;

  // Check if this node matches search
  const matchesSearch = useMemo(() => {
    if (!searchQuery) return false;
    const query = searchQuery.toLowerCase();
    const nameStr = String(name).toLowerCase();
    const valueStr = type !== 'object' && type !== 'array' ? String(value).toLowerCase() : '';
    return nameStr.includes(query) || valueStr.includes(query);
  }, [searchQuery, name, value, type]);

  // Build the JSONPath for this node
  const currentPath = path ? (typeof name === 'number' ? `${path}[${name}]` : `${path}.${name}`) : `$.${name}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const valueToCopy = isExpandable ? JSON.stringify(value, null, 2) : value;
    onCopyPath(currentPath, valueToCopy);
    setCopiedPath(currentPath);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Don't render if beyond max depth
  if (depth > maxDepth) {
    return null;
  }

  return (
    <div className={cn('group', matchesSearch && 'bg-yellow-100 dark:bg-yellow-900/30 -mx-2 px-2')}>
      <div
        className={cn(
          'flex items-center py-0.5 hover:bg-muted/50 rounded cursor-pointer',
          'select-none'
        )}
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        {/* Expand/Collapse icon */}
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {isExpandable && !isEmpty && (
            isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )
          )}
        </div>

        {/* Key name */}
        <span className="text-sm font-mono text-foreground/80">
          {typeof name === 'string' ? `"${name}"` : name}
        </span>
        <span className="text-muted-foreground mx-1">:</span>

        {/* Value or type indicator */}
        {isExpandable ? (
          <span className="text-sm text-muted-foreground">
            {type === 'array' ? (
              isEmpty ? '[]' : `[${Object.keys(value).length}]`
            ) : (
              isEmpty ? '{}' : `{${Object.keys(value).length}}`
            )}
          </span>
        ) : (
          <span className="text-sm font-mono">
            <ValueDisplay value={value} type={type} />
          </span>
        )}

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
          title={`Copy ${currentPath}`}
        >
          {copiedPath === currentPath ? (
            <Check className="w-3 h-3 text-green-500" />
          ) : (
            <Copy className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Children */}
      {isExpandable && isExpanded && !isEmpty && (
        <div>
          {Object.entries(value).map(([childKey, childValue]) => (
            <TreeNode
              key={childKey}
              name={type === 'array' ? parseInt(childKey) : childKey}
              value={childValue}
              depth={depth + 1}
              maxDepth={maxDepth}
              defaultExpanded={defaultExpanded}
              searchQuery={searchQuery}
              path={currentPath}
              onCopyPath={onCopyPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function JsonTreeView({
  data,
  searchable = true,
  defaultExpanded = true,
  maxDepth = 10,
  className,
}: JsonTreeViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandAll, setExpandAll] = useState(defaultExpanded);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const handleCopyPath = useCallback((path: string, value: any) => {
    const textToCopy = typeof value === 'string' ? value : JSON.stringify(value);
    navigator.clipboard.writeText(textToCopy);
    setCopiedValue(path);
    setTimeout(() => setCopiedValue(null), 2000);
  }, []);

  const handleCopyAll = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedValue('all');
    setTimeout(() => setCopiedValue(null), 2000);
  }, [data]);

  // Handle primitive root values
  const type = getValueType(data);
  if (type !== 'object' && type !== 'array') {
    return (
      <div className={cn('font-mono text-sm p-2', className)}>
        <ValueDisplay value={data} type={type} />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
        {searchable && (
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keys or values..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpandAll(!expandAll)}
          className="text-xs"
        >
          {expandAll ? 'Collapse All' : 'Expand All'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyAll}
          className="text-xs"
        >
          {copiedValue === 'all' ? (
            <>
              <Check className="w-3 h-3 mr-1 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              Copy All
            </>
          )}
        </Button>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-auto p-2 font-mono text-sm">
        {Object.keys(data).length === 0 ? (
          <span className="text-muted-foreground">{type === 'array' ? '[]' : '{}'}</span>
        ) : (
          Object.entries(data).map(([key, value]) => (
            <TreeNode
              key={key}
              name={type === 'array' ? parseInt(key) : key}
              value={value}
              depth={0}
              maxDepth={maxDepth}
              defaultExpanded={expandAll}
              searchQuery={searchQuery}
              path="$"
              onCopyPath={handleCopyPath}
            />
          ))
        )}
      </div>
    </div>
  );
}
