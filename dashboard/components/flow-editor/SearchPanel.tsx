'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  X,
  Filter,
  ChevronDown,
  ChevronRight,
  Globe,
  Database,
  FileText,
  Clock,
  CheckCircle,
  Wand2,
  GitBranch,
  Repeat,
  Server,
  ServerOff,
  FileCode,
  FileCheck,
  MessageSquare,
  GitMerge,
  Network,
  Radio,
  Chrome,
  Timer,
  Box,
  HardDrive,
  Activity,
  Settings,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FlowNode, ActionType, FlowNodeData } from './types';
import { isFlowNodeData } from './types';

const actionIcons: Record<ActionType, React.ElementType> = {
  http_request: Globe,
  grpc_call: Network,
  grpc_stream: Network,
  websocket: Radio,
  database_query: Database,
  db_poll: Database,
  kafka_producer: MessageSquare,
  kafka_consumer: MessageSquare,
  browser: Chrome,
  log: FileText,
  delay: Clock,
  assert: CheckCircle,
  transform: Wand2,
  condition: GitBranch,
  for_each: Repeat,
  parallel: GitMerge,
  wait_for: Timer,
  wait_until: Timer,
  run_flow: GitBranch,
  mock_server_start: Server,
  mock_server_stop: ServerOff,
  mock_server_verify: CheckCircle,
  mock_server_update: Server,
  mock_server_reset_state: Server,
  contract_generate: FileCode,
  contract_verify: FileCheck,
  docker_run: Box,
  docker_stop: Box,
  'redis.get': Database,
  'redis.set': Database,
  'redis.del': Database,
  'redis.exists': Database,
  'minio.put': HardDrive,
  'minio.get': HardDrive,
  'minio.delete': HardDrive,
  'minio.assert': HardDrive,
  'neo4j.query': Network,
  'neo4j.assert': Network,
  'otel.inject': Activity,
  'otel.assert': Activity,
  'postgresql.query': Database,
  'postgresql.insert': Database,
  'postgresql.update': Database,
  'postgresql.delete': Database,
  'postgresql.assert': Database,
  'postgresql.execute': Database,
  'postgresql.transaction': Database,
  'postgresql.tables': Database,
  'postgresql.columns': Database,
  mock_server_configure: Settings,
};

const actionCategories = [
  { value: 'all', label: 'All Actions' },
  { value: 'http', label: 'HTTP & API', types: ['http_request', 'grpc_call', 'grpc_stream', 'websocket'] as ActionType[] },
  { value: 'database', label: 'Database', types: ['database_query', 'db_poll'] as ActionType[] },
  { value: 'messaging', label: 'Messaging', types: ['kafka_producer', 'kafka_consumer'] as ActionType[] },
  { value: 'control', label: 'Control Flow', types: ['condition', 'for_each', 'parallel', 'wait_for', 'wait_until', 'run_flow'] as ActionType[] },
  { value: 'browser', label: 'Browser', types: ['browser'] as ActionType[] },
  { value: 'utility', label: 'Utilities', types: ['log', 'delay', 'assert', 'transform'] as ActionType[] },
  { value: 'mock', label: 'Mock Server', types: ['mock_server_start', 'mock_server_stop', 'mock_server_verify', 'mock_server_update', 'mock_server_reset_state'] as ActionType[] },
  { value: 'contract', label: 'Contract Testing', types: ['contract_generate', 'contract_verify'] as ActionType[] },
];

export interface SearchPanelProps {
  nodes: FlowNode[];
  onNodeSelect: (nodeId: string) => void;
  onClose?: () => void;
  className?: string;
}

export default function SearchPanel({
  nodes,
  onNodeSelect,
  onClose,
  className,
}: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['all']));

  const flowNodes = useMemo(() => nodes.filter((node) => isFlowNodeData(node.data)), [nodes]);

  const filteredNodes = useMemo(() => {
    let result = flowNodes;
    if (selectedCategory !== 'all') {
      const category = actionCategories.find((c) => c.value === selectedCategory);
      if (category?.types) {
        result = result.filter((node) => {
          const data = node.data as FlowNodeData;
          return category.types!.includes(data.action);
        });
      }
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((node) => {
        const data = node.data as FlowNodeData;
        const config = data.config;
        return (
          data.stepId.toLowerCase().includes(query) ||
          data.name?.toLowerCase().includes(query) ||
          data.label.toLowerCase().includes(query) ||
          data.description?.toLowerCase().includes(query) ||
          data.action.toLowerCase().includes(query) ||
          config.url?.toLowerCase().includes(query) ||
          config.method?.toLowerCase().includes(query) ||
          config.query?.toLowerCase().includes(query) ||
          config.message?.toLowerCase().includes(query) ||
          config.expression?.toLowerCase().includes(query)
        );
      });
    }
    return result;
  }, [flowNodes, selectedCategory, searchQuery]);

  const groupedNodes = useMemo(() => {
    const groups: Record<string, FlowNode[]> = {};
    filteredNodes.forEach((node) => {
      const action = (node.data as FlowNodeData).action;
      if (!groups[action]) groups[action] = [];
      groups[action].push(node);
    });
    return groups;
  }, [filteredNodes]);

  const getActionLabel = (action: ActionType): string =>
    action.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const toggleCategory = (action: string) => {
    const next = new Set(expandedCategories);
    if (next.has(action)) next.delete(action); else next.add(action);
    setExpandedCategories(next);
  };

  const getNodePreview = (node: FlowNode): string => {
    const data = node.data as FlowNodeData;
    const config = data.config;
    switch (data.action) {
      case 'http_request': return `${config.method || 'GET'} ${config.url || 'No URL'}`;
      case 'database_query': return config.query?.substring(0, 50) || 'No query';
      case 'log': return config.message || 'No message';
      case 'delay': return `Wait ${config.duration || '0s'}`;
      case 'assert': return config.expression || 'No expression';
      case 'transform': return `→ ${config.output_var || 'output'}`;
      case 'condition': return `if ${config.expression || '...'}`;
      case 'for_each': return `foreach ${config.item_var || 'item'}`;
      case 'mock_server_start': return `${config.name || 'unnamed'}:${config.port || 8080}`;
      default: return data.description || '';
    }
  };

  useEffect(() => {
    if (searchQuery.trim()) setExpandedCategories(new Set(Object.keys(groupedNodes)));
  }, [searchQuery, groupedNodes]);

  const totalResults = filteredNodes.length;

  return (
    <div className={cn('flex flex-col h-full bg-[#0b0f18]', className)}>
      {/* Header */}
      <div className="p-3 border-b border-[#1a2332] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[#4a6480]" />
            <span className="font-semibold text-sm text-[#c8dce8]">Search & Filter</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#4a6480]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="h-8 text-xs pl-7 pr-7"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3 w-3 text-[#4a6480]" />
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {actionCategories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value} className="text-xs">
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between text-xs text-[#4a6480]">
          <span>{totalResults} {totalResults === 1 ? 'result' : 'results'}</span>
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
              className="flex items-center h-6 px-2 rounded text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-2">
        {totalResults === 0 ? (
          <div className="text-center py-12 text-[#3d5670]">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No nodes found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="space-y-1">
            {Object.entries(groupedNodes).sort(([a], [b]) => a.localeCompare(b)).map(([action, nodesInGroup]) => {
              const Icon = actionIcons[action as ActionType] || Box;
              const isExpanded = expandedCategories.has(action);
              return (
                <div key={action} className="space-y-1">
                  <button
                    onClick={() => toggleCategory(action)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#131b26] transition-colors"
                  >
                    {isExpanded
                      ? <ChevronDown className="h-3 w-3 text-[#4a6480]" />
                      : <ChevronRight className="h-3 w-3 text-[#4a6480]" />
                    }
                    <Icon className="h-3 w-3 text-[#4a6480]" />
                    <span className="text-xs font-medium flex-1 text-left text-[#7fa8c8]">
                      {getActionLabel(action as ActionType)}
                    </span>
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                      {nodesInGroup.length}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="ml-5 space-y-0.5">
                      {nodesInGroup.map((node) => {
                        const data = node.data as FlowNodeData;
                        const preview = getNodePreview(node);
                        return (
                          <button
                            key={node.id}
                            onClick={() => onNodeSelect(node.id)}
                            className="w-full text-left p-2 rounded border border-[#1a2332] hover:border-[#2a3d52] hover:bg-[#131b26] transition-colors group"
                          >
                            <div className="flex items-start gap-2">
                              <Icon className="h-3.5 w-3.5 text-[#4a6480] mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate text-[#7fa8c8] group-hover:text-teal-400 transition-colors">
                                  {data.name || data.label}
                                </div>
                                <div className="text-[10px] text-[#4a6480] font-mono mt-0.5">{data.stepId}</div>
                                {preview && (
                                  <div className="text-[10px] text-[#3d5670] mt-1 truncate">{preview}</div>
                                )}
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  {data.assert && data.assert.length > 0 && (
                                    <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                                      {data.assert.length} assert
                                    </span>
                                  )}
                                  {data.output && Object.keys(data.output).length > 0 && (
                                    <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                                      {Object.keys(data.output).length} output
                                    </span>
                                  )}
                                  {data.comments && data.comments.length > 0 && (
                                    <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                                      {data.comments.length} comment
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-[#1a2332] bg-[#0b0f18]">
        <div className="text-[10px] text-[#4a6480] space-y-1">
          <div className="flex items-center justify-between">
            <span>Total nodes:</span>
            <span className="font-medium">{flowNodes.length}</span>
          </div>
          {selectedCategory !== 'all' && (
            <div className="flex items-center justify-between">
              <span>Filtered:</span>
              <span className="font-medium">{filteredNodes.length}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
