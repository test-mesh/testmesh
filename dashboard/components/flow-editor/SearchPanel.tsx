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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

// Icon mapping for action types
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
};

// Action type categories
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

  // Filter flow nodes (exclude section headers)
  const flowNodes = useMemo(() => {
    return nodes.filter((node) => isFlowNodeData(node.data));
  }, [nodes]);

  // Search and filter nodes
  const filteredNodes = useMemo(() => {
    let result = flowNodes;

    // Filter by category
    if (selectedCategory !== 'all') {
      const category = actionCategories.find((c) => c.value === selectedCategory);
      if (category && category.types) {
        result = result.filter((node) => {
          const data = node.data as FlowNodeData;
          return category.types!.includes(data.action);
        });
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((node) => {
        const data = node.data as FlowNodeData;

        // Search in step ID
        if (data.stepId.toLowerCase().includes(query)) return true;

        // Search in name/label
        if (data.name?.toLowerCase().includes(query)) return true;
        if (data.label.toLowerCase().includes(query)) return true;

        // Search in description
        if (data.description?.toLowerCase().includes(query)) return true;

        // Search in action type
        if (data.action.toLowerCase().includes(query)) return true;

        // Search in config values (common fields)
        const config = data.config;
        if (config.url?.toLowerCase().includes(query)) return true;
        if (config.method?.toLowerCase().includes(query)) return true;
        if (config.query?.toLowerCase().includes(query)) return true;
        if (config.message?.toLowerCase().includes(query)) return true;
        if (config.expression?.toLowerCase().includes(query)) return true;

        return false;
      });
    }

    return result;
  }, [flowNodes, selectedCategory, searchQuery]);

  // Group nodes by action type
  const groupedNodes = useMemo(() => {
    const groups: Record<string, FlowNode[]> = {};

    filteredNodes.forEach((node) => {
      const data = node.data as FlowNodeData;
      const action = data.action;

      if (!groups[action]) {
        groups[action] = [];
      }
      groups[action].push(node);
    });

    return groups;
  }, [filteredNodes]);

  // Get action type label
  const getActionLabel = (action: ActionType): string => {
    return action.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Toggle category expansion
  const toggleCategory = (action: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(action)) {
      newExpanded.delete(action);
    } else {
      newExpanded.add(action);
    }
    setExpandedCategories(newExpanded);
  };

  // Handle node selection
  const handleNodeClick = (nodeId: string) => {
    onNodeSelect(nodeId);
  };

  // Get node preview text
  const getNodePreview = (node: FlowNode): string => {
    const data = node.data as FlowNodeData;
    const config = data.config;

    switch (data.action) {
      case 'http_request':
        return `${config.method || 'GET'} ${config.url || 'No URL'}`;
      case 'database_query':
        return config.query?.substring(0, 50) || 'No query';
      case 'log':
        return config.message || 'No message';
      case 'delay':
        return `Wait ${config.duration || '0s'}`;
      case 'assert':
        return config.expression || 'No expression';
      case 'transform':
        return `→ ${config.output_var || 'output'}`;
      case 'condition':
        return `if ${config.expression || '...'}`;
      case 'for_each':
        return `foreach ${config.item_var || 'item'}`;
      case 'mock_server_start':
        return `${config.name || 'unnamed'}:${config.port || 8080}`;
      default:
        return data.description || '';
    }
  };

  // Auto-expand all categories when search query is present
  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedCategories(new Set(Object.keys(groupedNodes)));
    }
  }, [searchQuery, groupedNodes]);

  const totalResults = filteredNodes.length;

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="p-3 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Search & Filter</span>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="h-8 text-xs pl-7 pr-7"
            autoFocus
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-3 w-3 text-muted-foreground" />
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

        {/* Results Count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {totalResults} {totalResults === 1 ? 'result' : 'results'}
          </span>
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="h-6 text-xs"
            >
              Clear all
            </Button>
          )}
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto p-2">
        {totalResults === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No nodes found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="space-y-1">
            {Object.entries(groupedNodes)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([action, nodesInGroup]) => {
                const Icon = actionIcons[action as ActionType] || Box;
                const isExpanded = expandedCategories.has(action);

                return (
                  <div key={action} className="space-y-1">
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(action)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium flex-1 text-left">
                        {getActionLabel(action as ActionType)}
                      </span>
                      <Badge variant="secondary" className="h-4 text-[10px] px-1">
                        {nodesInGroup.length}
                      </Badge>
                    </button>

                    {/* Nodes in Category */}
                    {isExpanded && (
                      <div className="ml-5 space-y-0.5">
                        {nodesInGroup.map((node) => {
                          const data = node.data as FlowNodeData;
                          const preview = getNodePreview(node);

                          return (
                            <button
                              key={node.id}
                              onClick={() => handleNodeClick(node.id)}
                              className="w-full text-left p-2 rounded border border-transparent hover:border-border hover:bg-muted/30 transition-colors group"
                            >
                              <div className="flex items-start gap-2">
                                <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                                    {data.name || data.label}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                    {data.stepId}
                                  </div>
                                  {preview && (
                                    <div className="text-[10px] text-muted-foreground mt-1 truncate">
                                      {preview}
                                    </div>
                                  )}
                                  {/* Badges */}
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    {data.assert && data.assert.length > 0 && (
                                      <Badge variant="secondary" className="h-3.5 text-[9px] px-1">
                                        {data.assert.length} assert
                                      </Badge>
                                    )}
                                    {data.output && Object.keys(data.output).length > 0 && (
                                      <Badge variant="secondary" className="h-3.5 text-[9px] px-1">
                                        {Object.keys(data.output).length} output
                                      </Badge>
                                    )}
                                    {data.comments && data.comments.length > 0 && (
                                      <Badge variant="secondary" className="h-3.5 text-[9px] px-1">
                                        {data.comments.length} comment
                                      </Badge>
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

      {/* Quick Actions */}
      <div className="p-2 border-t bg-muted/20">
        <div className="text-[10px] text-muted-foreground space-y-1">
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
