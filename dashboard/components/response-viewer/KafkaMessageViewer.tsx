'use client';

import { useState } from 'react';
import {
  MessageSquare,
  Clock,
  Key,
  Hash,
  Layers,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FileJson,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface KafkaMessage {
  topic: string;
  partition: number;
  offset: number;
  key?: string;
  value: unknown;
  headers?: Record<string, string>;
  timestamp: string;
}

interface KafkaMessageViewerProps {
  messages: KafkaMessage[];
  topic?: string;
  consumerGroup?: string;
  className?: string;
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString();
  } catch {
    return ts;
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    try {
      // Try to parse and pretty print JSON
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function isJSON(value: unknown): boolean {
  if (typeof value === 'object') return true;
  if (typeof value !== 'string') return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export default function KafkaMessageViewer({
  messages,
  topic,
  consumerGroup,
  className,
}: KafkaMessageViewerProps) {
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set([0]));
  const [copied, setCopied] = useState<number | null>(null);

  const toggleMessage = (index: number) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const copyValue = async (value: unknown, index: number) => {
    await navigator.clipboard.writeText(formatValue(value));
    setCopied(index);
    setTimeout(() => setCopied(null), 1500);
  };

  if (messages.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-muted-foreground', className)}>
        <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">No messages received</p>
        {topic && <p className="text-xs mt-2">Topic: {topic}</p>}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-orange-500" />
          <span className="font-medium text-sm">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
          {topic && (
            <Badge variant="outline" className="text-xs">
              {topic}
            </Badge>
          )}
        </div>
        {consumerGroup && (
          <span className="text-xs text-muted-foreground">
            Consumer: {consumerGroup}
          </span>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {messages.map((message, index) => {
            const isExpanded = expandedMessages.has(index);
            const valueIsJSON = isJSON(message.value);

            return (
              <Collapsible
                key={index}
                open={isExpanded}
                onOpenChange={() => toggleMessage(index)}
              >
                <div className="border rounded-lg overflow-hidden">
                  {/* Message Header */}
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-2 p-2 bg-muted/30 hover:bg-muted/50 transition-colors">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}

                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Partition & Offset */}
                        <div className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs font-mono">
                            P{message.partition}:O{message.offset}
                          </span>
                        </div>

                        {/* Key */}
                        {message.key && (
                          <div className="flex items-center gap-1">
                            <Key className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs font-mono truncate max-w-[100px]">
                              {message.key}
                            </span>
                          </div>
                        )}

                        {/* Timestamp */}
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span className="text-xs">
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>
                      </div>

                      {/* Type indicator */}
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {valueIsJSON ? 'JSON' : 'Text'}
                      </Badge>
                    </div>
                  </CollapsibleTrigger>

                  {/* Message Content */}
                  <CollapsibleContent>
                    <div className="border-t">
                      <Tabs defaultValue="value" className="w-full">
                        <TabsList className="w-full justify-start rounded-none border-b h-8 px-2">
                          <TabsTrigger value="value" className="text-xs h-6">
                            {valueIsJSON ? (
                              <FileJson className="w-3 h-3 mr-1" />
                            ) : (
                              <FileText className="w-3 h-3 mr-1" />
                            )}
                            Value
                          </TabsTrigger>
                          {message.headers && Object.keys(message.headers).length > 0 && (
                            <TabsTrigger value="headers" className="text-xs h-6">
                              <Hash className="w-3 h-3 mr-1" />
                              Headers ({Object.keys(message.headers).length})
                            </TabsTrigger>
                          )}
                        </TabsList>

                        <TabsContent value="value" className="m-0">
                          <div className="relative">
                            <pre className="p-3 text-xs font-mono bg-muted/30 overflow-x-auto max-h-64">
                              {formatValue(message.value)}
                            </pre>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyValue(message.value, index);
                              }}
                              className="absolute top-1 right-1 h-6 w-6 p-0"
                            >
                              {copied === index ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </TabsContent>

                        {message.headers && (
                          <TabsContent value="headers" className="m-0">
                            <div className="p-3 space-y-1">
                              {Object.entries(message.headers).map(([key, value]) => (
                                <div key={key} className="flex items-start gap-2 text-xs">
                                  <span className="font-medium text-muted-foreground min-w-[100px]">
                                    {key}:
                                  </span>
                                  <span className="font-mono">{value}</span>
                                </div>
                              ))}
                            </div>
                          </TabsContent>
                        )}
                      </Tabs>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>

      {/* Summary */}
      <div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>Partitions: {new Set(messages.map((m) => m.partition)).size}</span>
          <span>
            Offset range: {Math.min(...messages.map((m) => m.offset))} -{' '}
            {Math.max(...messages.map((m) => m.offset))}
          </span>
        </div>
      </div>
    </div>
  );
}
