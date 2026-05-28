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

interface JsonTreeViewProps {
  data: any;
  searchable?: boolean;
  defaultExpanded?: boolean;
  maxDepth?: number;
  className?: string;
}

function getValueType(value: any): 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

function getValueColor(type: string): string {
  switch (type) {
    case 'string': return 'text-green-400';
    case 'number': return 'text-blue-400';
    case 'boolean': return 'text-purple-400';
    case 'null': return 'text-[#4a6480]';
    default: return '';
  }
}

function ValueDisplay({ value, type }: { value: any; type: string }) {
  const colorClass = getValueColor(type);
  if (type === 'null') return <span className={colorClass}>null</span>;
  if (type === 'string') return <span className={colorClass}>"{value}"</span>;
  if (type === 'boolean') return <span className={colorClass}>{value ? 'true' : 'false'}</span>;
  return <span className={colorClass}>{String(value)}</span>;
}

function TreeNode({
  name, value, depth, maxDepth, defaultExpanded, searchQuery, path, onCopyPath,
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
  const [isExpanded, setIsExpanded] = useState(defaultExpanded && depth < 2);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const type = getValueType(value);
  const isExpandable = type === 'object' || type === 'array';
  const isEmpty = isExpandable && Object.keys(value).length === 0;

  const matchesSearch = useMemo(() => {
    if (!searchQuery) return false;
    const query = searchQuery.toLowerCase();
    const nameStr = String(name).toLowerCase();
    const valueStr = type !== 'object' && type !== 'array' ? String(value).toLowerCase() : '';
    return nameStr.includes(query) || valueStr.includes(query);
  }, [searchQuery, name, value, type]);

  const currentPath = path
    ? (typeof name === 'number' ? `${path}[${name}]` : `${path}.${name}`)
    : `$.${name}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyPath(currentPath, isExpandable ? JSON.stringify(value, null, 2) : value);
    setCopiedPath(currentPath);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  if (depth > maxDepth) return null;

  return (
    <div className={cn('group', matchesSearch && 'bg-yellow-400/10 -mx-2 px-2')}>
      <div
        className="flex items-center py-0.5 hover:bg-[#131b26] rounded cursor-pointer select-none"
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {isExpandable && !isEmpty && (
            isExpanded
              ? <ChevronDown className="w-3 h-3 text-[#4a6480]" />
              : <ChevronRight className="w-3 h-3 text-[#4a6480]" />
          )}
        </div>
        <span className="text-xs font-mono text-[#c8dce8]">
          {typeof name === 'string' ? `"${name}"` : name}
        </span>
        <span className="text-[#4a6480] mx-1 text-xs">:</span>
        {isExpandable ? (
          <span className="text-xs text-[#4a6480]">
            {type === 'array'
              ? (isEmpty ? '[]' : `[${Object.keys(value).length}]`)
              : (isEmpty ? '{}' : `{${Object.keys(value).length}}`)}
          </span>
        ) : (
          <span className="text-xs font-mono">
            <ValueDisplay value={value} type={type} />
          </span>
        )}
        <button
          onClick={handleCopy}
          className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-[#1a2d3d]"
          title={`Copy ${currentPath}`}
        >
          {copiedPath === currentPath
            ? <Check className="w-3 h-3 text-teal-400" />
            : <Copy className="w-3 h-3 text-[#4a6480]" />}
        </button>
      </div>

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
    navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value));
    setCopiedValue(path);
    setTimeout(() => setCopiedValue(null), 2000);
  }, []);

  const handleCopyAll = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedValue('all');
    setTimeout(() => setCopiedValue(null), 2000);
  }, [data]);

  const type = getValueType(data);
  if (type !== 'object' && type !== 'array') {
    return (
      <div className={cn('font-mono text-xs p-2', className)}>
        <ValueDisplay value={data} type={type} />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center gap-2 p-2 border-b border-[#1a2332] bg-[#0b0f18]">
        {searchable && (
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a6480]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keys or values..."
              className="pl-7 h-7 text-xs"
            />
          </div>
        )}
        <button
          onClick={() => setExpandAll(!expandAll)}
          className="flex items-center h-7 px-2 rounded text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          {expandAll ? 'Collapse All' : 'Expand All'}
        </button>
        <button
          onClick={handleCopyAll}
          className="flex items-center gap-1 h-7 px-2 rounded text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          {copiedValue === 'all'
            ? <><Check className="w-3 h-3 text-teal-400" /> Copied</>
            : <><Copy className="w-3 h-3" /> Copy All</>}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {Object.keys(data).length === 0 ? (
          <span className="text-[#4a6480]">{type === 'array' ? '[]' : '{}'}</span>
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
