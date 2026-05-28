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
import { ScrollArea } from '@/components/ui/scroll-area';
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
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function isJSON(value: unknown): boolean {
  if (typeof value === 'object') return true;
  if (typeof value !== 'string') return false;
  try { JSON.parse(value); return true; } catch { return false; }
}

export default function KafkaMessageViewer({
  messages,
  topic,
  consumerGroup,
  className,
}: KafkaMessageViewerProps) {
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set([0]));
  const [copied, setCopied] = useState<number | null>(null);
  const [msgTab, setMsgTab] = useState<Record<number, 'value' | 'headers'>>({});

  const toggleMessage = (index: number) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const copyValue = async (value: unknown, index: number) => {
    await navigator.clipboard.writeText(formatValue(value));
    setCopied(index);
    setTimeout(() => setCopied(null), 1500);
  };

  const getMsgTab = (i: number) => msgTab[i] ?? 'value';

  if (messages.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-[#3d5670]', className)}>
        <MessageSquare className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm">No messages received</p>
        {topic && <p className="text-xs mt-1">Topic: {topic}</p>}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a2332]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-xs font-medium text-[#c8dce8]">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
          {topic && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-[#1e2d3d] bg-[#0f1923] text-[#4a6480]">
              {topic}
            </span>
          )}
        </div>
        {consumerGroup && (
          <span className="text-[10px] text-[#3d5670]">Consumer: {consumerGroup}</span>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {messages.map((message, index) => {
            const isExpanded = expandedMessages.has(index);
            const valueIsJSON = isJSON(message.value);
            const hasHeaders = message.headers && Object.keys(message.headers).length > 0;
            const activeTab = getMsgTab(index);

            return (
              <Collapsible
                key={index}
                open={isExpanded}
                onOpenChange={() => toggleMessage(index)}
              >
                <div className="rounded-lg border border-[#1e2d3d] overflow-hidden">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-2 p-2 bg-[#0f1923] hover:bg-[#131b26] transition-colors">
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-[#4a6480] shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-[#4a6480] shrink-0" />
                      }
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-[#4a6480]" />
                          <span className="text-[10px] font-mono text-[#7fa8c8]">P{message.partition}:O{message.offset}</span>
                        </div>
                        {message.key && (
                          <div className="flex items-center gap-1">
                            <Key className="w-3 h-3 text-[#4a6480]" />
                            <span className="text-[10px] font-mono text-[#7fa8c8] truncate max-w-[100px]">{message.key}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-[#4a6480]">
                          <Clock className="w-3 h-3" />
                          <span className="text-[10px]">{formatTimestamp(message.timestamp)}</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480] shrink-0">
                        {valueIsJSON ? 'JSON' : 'Text'}
                      </span>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="border-t border-[#1a2332]">
                      {/* Inner tab bar */}
                      <div className="flex items-center gap-1 px-2 py-1 border-b border-[#1a2332]">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMsgTab((t) => ({ ...t, [index]: 'value' })); }}
                          className={cn(
                            'flex items-center gap-1 h-5 px-2 rounded text-[10px] transition-colors',
                            activeTab === 'value' ? 'bg-teal-400/15 text-teal-400' : 'text-[#4a6480] hover:text-[#7fa8c8]'
                          )}
                        >
                          {valueIsJSON ? <FileJson className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                          Value
                        </button>
                        {hasHeaders && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setMsgTab((t) => ({ ...t, [index]: 'headers' })); }}
                            className={cn(
                              'flex items-center gap-1 h-5 px-2 rounded text-[10px] transition-colors',
                              activeTab === 'headers' ? 'bg-teal-400/15 text-teal-400' : 'text-[#4a6480] hover:text-[#7fa8c8]'
                            )}
                          >
                            <Hash className="w-3 h-3" />
                            Headers ({Object.keys(message.headers!).length})
                          </button>
                        )}
                      </div>

                      {activeTab === 'value' && (
                        <div className="relative">
                          <pre className="p-3 text-[10px] font-mono bg-[#0b0f18] overflow-x-auto max-h-64 text-[#7fa8c8]">
                            {formatValue(message.value)}
                          </pre>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyValue(message.value, index); }}
                            className="absolute top-1 right-1 flex items-center justify-center h-5 w-5 rounded bg-[#0f1923] border border-[#1e2d3d] text-[#4a6480] hover:text-[#7fa8c8] transition-colors"
                          >
                            {copied === index ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      )}

                      {activeTab === 'headers' && message.headers && (
                        <div className="p-3 space-y-1">
                          {Object.entries(message.headers).map(([key, value]) => (
                            <div key={key} className="flex items-start gap-2 text-[10px]">
                              <span className="font-medium text-[#4a6480] min-w-[100px]">{key}:</span>
                              <span className="font-mono text-[#7fa8c8]">{value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>

      {/* Summary */}
      <div className="px-3 py-2 border-t border-[#1a2332] bg-[#0f1923]">
        <div className="flex items-center gap-4 text-[10px] text-[#4a6480]">
          <span>Partitions: {new Set(messages.map((m) => m.partition)).size}</span>
          <span>
            Offset range: {Math.min(...messages.map((m) => m.offset))} – {Math.max(...messages.map((m) => m.offset))}
          </span>
        </div>
      </div>
    </div>
  );
}
