'use client';

import { useState } from 'react';
import {
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
  ChevronDown,
  ChevronRight,
  Search,
  MessageSquare,
  GitMerge,
  Network,
  Radio,
  Chrome,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { ActionType, PaletteItem } from './types';
import { defaultConfigs } from './utils';

// Palette items organized by category
const paletteItems: PaletteItem[] = [
  // HTTP & API
  {
    type: 'http_request',
    label: 'HTTP Request',
    description: 'Make HTTP API calls (GET, POST, PUT, DELETE)',
    icon: 'Globe',
    category: 'http',
    defaultConfig: defaultConfigs.http_request,
  },
  {
    type: 'grpc_call',
    label: 'gRPC Call',
    description: 'Execute unary gRPC calls',
    icon: 'Network',
    category: 'http',
    defaultConfig: defaultConfigs.grpc_call,
  },
  {
    type: 'grpc_stream',
    label: 'gRPC Stream',
    description: 'Handle streaming gRPC calls',
    icon: 'Network',
    category: 'http',
    defaultConfig: defaultConfigs.grpc_stream,
  },
  {
    type: 'websocket',
    label: 'WebSocket',
    description: 'WebSocket connections and messaging',
    icon: 'Radio',
    category: 'http',
    defaultConfig: defaultConfigs.websocket,
  },

  // Database
  {
    type: 'database_query',
    label: 'Database Query',
    description: 'Execute SQL queries against a database',
    icon: 'Database',
    category: 'database',
    defaultConfig: defaultConfigs.database_query,
  },
  {
    type: 'db_poll',
    label: 'DB Poll',
    description: 'Poll a database query until a condition is met',
    icon: 'Database',
    category: 'database',
    defaultConfig: defaultConfigs.db_poll,
  },

  // Control Flow
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch flow based on a condition',
    icon: 'GitBranch',
    category: 'control',
    defaultConfig: defaultConfigs.condition,
  },
  {
    type: 'for_each',
    label: 'For Each',
    description: 'Loop over items in a collection',
    icon: 'Repeat',
    category: 'control',
    defaultConfig: defaultConfigs.for_each,
  },
  {
    type: 'parallel',
    label: 'Parallel',
    description: 'Execute multiple steps concurrently',
    icon: 'GitMerge',
    category: 'control',
    defaultConfig: defaultConfigs.parallel,
  },
  {
    type: 'wait_for',
    label: 'Wait For',
    description: 'Poll HTTP endpoint or TCP port until available',
    icon: 'Clock',
    category: 'control',
    defaultConfig: defaultConfigs.wait_for,
  },
  {
    type: 'wait_until',
    label: 'Wait Until',
    description: 'Poll nested steps until a condition expression is met',
    icon: 'Clock',
    category: 'control',
    defaultConfig: defaultConfigs.wait_until,
  },
  {
    type: 'run_flow',
    label: 'Sub-flow',
    description: 'Execute another flow as a step',
    icon: 'GitBranch',
    category: 'control',
    defaultConfig: defaultConfigs.run_flow,
  },

  // Messaging
  {
    type: 'kafka_producer',
    label: 'Kafka Publish',
    description: 'Publish message to Kafka topic',
    icon: 'MessageSquare',
    category: 'messaging',
    defaultConfig: defaultConfigs.kafka_producer,
  },
  {
    type: 'kafka_consumer',
    label: 'Kafka Consume',
    description: 'Consume messages from Kafka topic',
    icon: 'MessageSquare',
    category: 'messaging',
    defaultConfig: defaultConfigs.kafka_consumer,
  },

  // Browser
  {
    type: 'browser',
    label: 'Browser',
    description: 'Automate browser interactions and testing',
    icon: 'Chrome',
    category: 'browser',
    defaultConfig: defaultConfigs.browser,
  },

  // Utility
  {
    type: 'log',
    label: 'Log',
    description: 'Write a message to the execution log',
    icon: 'FileText',
    category: 'utility',
    defaultConfig: defaultConfigs.log,
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait for a specified duration',
    icon: 'Clock',
    category: 'utility',
    defaultConfig: defaultConfigs.delay,
  },
  {
    type: 'assert',
    label: 'Assert',
    description: 'Validate a condition is true',
    icon: 'CheckCircle',
    category: 'utility',
    defaultConfig: defaultConfigs.assert,
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Transform data with expressions',
    icon: 'Wand2',
    category: 'utility',
    defaultConfig: defaultConfigs.transform,
  },

  // Mock Server
  {
    type: 'mock_server_start',
    label: 'Start Mock Server',
    description: 'Start a mock API server',
    icon: 'Server',
    category: 'mock',
    defaultConfig: defaultConfigs.mock_server_start,
  },
  {
    type: 'mock_server_stop',
    label: 'Stop Mock Server',
    description: 'Stop a running mock server',
    icon: 'ServerOff',
    category: 'mock',
    defaultConfig: defaultConfigs.mock_server_stop,
  },

  // Contract Testing
  {
    type: 'contract_generate',
    label: 'Generate Contract',
    description: 'Generate a Pact contract',
    icon: 'FileCode',
    category: 'contract',
    defaultConfig: defaultConfigs.contract_generate,
  },
  {
    type: 'contract_verify',
    label: 'Verify Contract',
    description: 'Verify a Pact contract',
    icon: 'FileCheck',
    category: 'contract',
    defaultConfig: defaultConfigs.contract_verify,
  },
];

// Icon mapping
const iconMap: Record<string, React.ElementType> = {
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
};

// Category configuration
const categories = [
  { id: 'http', label: 'HTTP & API', color: 'text-blue-500' },
  { id: 'database', label: 'Database', color: 'text-purple-500' },
  { id: 'messaging', label: 'Messaging', color: 'text-violet-500' },
  { id: 'browser', label: 'Browser', color: 'text-amber-500' },
  { id: 'control', label: 'Control Flow', color: 'text-cyan-500' },
  { id: 'utility', label: 'Utilities', color: 'text-gray-500' },
  { id: 'mock', label: 'Mock Servers', color: 'text-pink-500' },
  { id: 'contract', label: 'Contract Testing', color: 'text-teal-500' },
];

interface NodePaletteProps {
  onDragStart?: (event: React.DragEvent, item: PaletteItem) => void;
  collapsed?: boolean;
}

export default function NodePalette({ onDragStart, collapsed = false }: NodePaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(categories.map((c) => c.id))
  );

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const filteredItems = paletteItems.filter(
    (item) =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDragStart = (event: React.DragEvent, item: PaletteItem) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'move';
    onDragStart?.(event, item);
  };

  if (collapsed) {
    return (
      <div className="w-12 border-r bg-muted/30 p-2 space-y-2">
        {paletteItems.slice(0, 6).map((item) => {
          const Icon = iconMap[item.icon];
          return (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => handleDragStart(e, item)}
              className="w-8 h-8 flex items-center justify-center rounded cursor-grab hover:bg-muted transition-colors"
              title={item.label}
            >
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm mb-2">Actions</h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search actions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Palette items */}
      <div className="flex-1 overflow-y-auto p-2">
        {searchQuery ? (
          // Flat list when searching
          <div className="space-y-1">
            {filteredItems.map((item) => (
              <PaletteItemComponent
                key={item.type}
                item={item}
                onDragStart={handleDragStart}
              />
            ))}
            {filteredItems.length === 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No actions found
              </div>
            )}
          </div>
        ) : (
          // Categorized list
          <div className="space-y-2">
            {categories.map((category) => {
              const categoryItems = paletteItems.filter(
                (item) => item.category === category.id
              );
              if (categoryItems.length === 0) return null;

              const isExpanded = expandedCategories.has(category.id);

              return (
                <div key={category.id}>
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium hover:bg-muted rounded transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <span className={category.color}>{category.label}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {categoryItems.length}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="mt-1 ml-2 space-y-1">
                      {categoryItems.map((item) => (
                        <PaletteItemComponent
                          key={item.type}
                          item={item}
                          onDragStart={handleDragStart}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="p-3 border-t bg-muted/50 text-xs text-muted-foreground">
        Drag actions onto the canvas to add them to your flow
      </div>
    </div>
  );
}

// Individual palette item component
function PaletteItemComponent({
  item,
  onDragStart,
}: {
  item: PaletteItem;
  onDragStart: (event: React.DragEvent, item: PaletteItem) => void;
}) {
  const Icon = iconMap[item.icon];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      className={cn(
        'flex items-start gap-2 p-2 rounded-lg border bg-background',
        'cursor-grab hover:border-primary/50 hover:shadow-sm',
        'transition-all active:cursor-grabbing'
      )}
    >
      <div className="p-1.5 rounded bg-muted">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{item.label}</div>
        <div className="text-xs text-muted-foreground line-clamp-1">
          {item.description}
        </div>
      </div>
    </div>
  );
}
