'use client';

import { Radio, Send, MessageCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import KeyValueEditor from './KeyValueEditor';

interface WebSocketFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function WebSocketForm({
  config,
  onChange,
  className,
}: WebSocketFormProps) {
  const headers = (config.headers as Record<string, string>) || {};
  const messages = (config.messages as any[]) || [];

  const addMessage = () => {
    const newMessage = { type: 'send', data: '{}', delay: '0s' };
    onChange('messages', [...messages, newMessage]);
  };

  const updateMessage = (index: number, updates: any) => {
    const newMessages = [...messages];
    newMessages[index] = { ...newMessages[index], ...updates };
    onChange('messages', newMessages);
  };

  const removeMessage = (index: number) => {
    onChange('messages', messages.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b border-[#1a2332]">
        <Radio className="h-4 w-4 text-teal-400" />
        <span className="text-sm font-medium text-[#c8dce8]">WebSocket</span>
      </div>

      <div className="p-3 bg-teal-400/5 border border-teal-400/20 rounded-lg">
        <p className="text-sm text-[#c8dce8]">
          Establish WebSocket connections, send messages, and validate received data.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="url">WebSocket URL</Label>
        <Input
          id="url"
          value={(config.url as string) || ''}
          onChange={(e) => onChange('url', e.target.value)}
          placeholder="ws://localhost:8080/chat"
          className="font-mono text-sm"
        />
        <p className="text-xs text-[#4a6480]">
          Use ws:// or wss:// protocol. Supports variable interpolation.
        </p>
      </div>

      <KeyValueEditor
        label="Connection Headers"
        description="HTTP headers sent during WebSocket handshake"
        value={headers}
        onChange={(v) => onChange('headers', v)}
        keyPlaceholder="Authorization"
        valuePlaceholder="Bearer ${token}"
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Message Sequence</Label>
          <button
            type="button"
            onClick={addMessage}
            className="flex items-center gap-1 h-6 px-2 rounded text-xs text-[#7fa8c8] hover:text-[#c8dce8] hover:bg-[#1a2d3d] transition-colors"
          >
            <Send className="w-3 h-3" />
            Add Message
          </button>
        </div>

        {messages.length === 0 ? (
          <div className="p-4 border border-[#1a2332] rounded-lg bg-[#0b0f18] text-center">
            <p className="text-sm text-[#4a6480]">
              No messages configured. Add messages to send/receive.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, index) => (
              <div key={index} className="p-3 border border-[#1a2332] rounded-lg space-y-3 bg-[#0b0f18]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#c8dce8]">Message {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeMessage(index)}
                    className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Action</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateMessage(index, { type: 'send' })}
                      className={cn(
                        'flex items-center gap-1 flex-1 h-8 px-3 rounded-lg border text-xs font-medium transition-colors',
                        msg.type === 'send'
                          ? 'border-teal-400/30 bg-teal-400/10 text-teal-400'
                          : 'border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8]'
                      )}
                    >
                      <Send className="w-3 h-3" />
                      Send
                    </button>
                    <button
                      type="button"
                      onClick={() => updateMessage(index, { type: 'receive' })}
                      className={cn(
                        'flex items-center gap-1 flex-1 h-8 px-3 rounded-lg border text-xs font-medium transition-colors',
                        msg.type === 'receive'
                          ? 'border-teal-400/30 bg-teal-400/10 text-teal-400'
                          : 'border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8]'
                      )}
                    >
                      <MessageCircle className="w-3 h-3" />
                      Receive
                    </button>
                  </div>
                </div>

                {msg.type === 'send' && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Data to Send (JSON or Text)</Label>
                      <Textarea
                        value={
                          typeof msg.data === 'object'
                            ? JSON.stringify(msg.data, null, 2)
                            : msg.data || ''
                        }
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            updateMessage(index, { data: parsed });
                          } catch {
                            updateMessage(index, { data: e.target.value });
                          }
                        }}
                        placeholder={'{"type": "message", "text": "Hello"}'}
                        rows={3}
                        className="font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Delay Before Sending</Label>
                      <Input
                        value={msg.delay || '0s'}
                        onChange={(e) => updateMessage(index, { delay: e.target.value })}
                        placeholder="0s"
                        className="font-mono text-xs h-7"
                      />
                    </div>
                  </>
                )}

                {msg.type === 'receive' && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Timeout</Label>
                      <Input
                        value={msg.timeout || '5s'}
                        onChange={(e) => updateMessage(index, { timeout: e.target.value })}
                        placeholder="5s"
                        className="font-mono text-xs h-7"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Match Pattern (Optional)</Label>
                      <Input
                        value={msg.match || ''}
                        onChange={(e) => updateMessage(index, { match: e.target.value })}
                        placeholder='$.type == "response"'
                        className="font-mono text-xs h-7"
                      />
                      <p className="text-[10px] text-[#4a6480]">
                        JSONPath expression to match specific messages
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Save As (Optional)</Label>
                      <Input
                        value={msg.save_as || ''}
                        onChange={(e) => updateMessage(index, { save_as: e.target.value })}
                        placeholder="response_data"
                        className="font-mono text-xs h-7"
                      />
                      <p className="text-[10px] text-[#4a6480]">
                        Variable name to store received message
                      </p>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="space-y-3 p-3 border border-[#1a2332] rounded-lg">
        <summary className="text-sm font-medium text-[#c8dce8] cursor-pointer">
          Connection Options
        </summary>
        <div className="pt-3 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="connect_timeout">Connection Timeout</Label>
            <Input
              id="connect_timeout"
              value={(config.connect_timeout as string) || '10s'}
              onChange={(e) => onChange('connect_timeout', e.target.value)}
              placeholder="10s"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ping_interval">Ping Interval</Label>
            <Input
              id="ping_interval"
              value={(config.ping_interval as string) || '30s'}
              onChange={(e) => onChange('ping_interval', e.target.value)}
              placeholder="30s"
              className="font-mono text-sm"
            />
            <p className="text-xs text-[#4a6480]">
              Send ping frames to keep connection alive. 0s = disabled.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_message_size">Max Message Size (bytes)</Label>
            <Input
              id="max_message_size"
              type="number"
              value={(config.max_message_size as number) || 1048576}
              onChange={(e) => onChange('max_message_size', parseInt(e.target.value))}
              placeholder="1048576"
            />
            <p className="text-xs text-[#4a6480]">
              Default: 1MB (1048576 bytes)
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-close Connection</Label>
              <p className="text-xs text-[#4a6480]">
                Close connection after message sequence completes
              </p>
            </div>
            <Switch
              checked={(config.auto_close as boolean) ?? true}
              onCheckedChange={(checked) => onChange('auto_close', checked)}
            />
          </div>
        </div>
      </details>

      <details className="space-y-2 p-3 border border-[#1a2332] rounded-lg">
        <summary className="text-sm font-medium text-[#c8dce8] cursor-pointer">
          Example Use Cases
        </summary>
        <div className="pt-2 space-y-3 text-xs">
          <div>
            <p className="font-medium mb-1 text-[#c8dce8]">1. Chat Message Flow</p>
            <div className="p-2 bg-[#1a2332] rounded font-mono text-[10px] space-y-1 text-[#7fa8c8]">
              <div>1. Connect to ws://chat.example.com/room/123</div>
              <div>2. Send: {'{'} "type": "join" {'}'}</div>
              <div>3. Receive: Welcome message</div>
              <div>4. Send: {'{'} "type": "msg", "text": "Hello" {'}'}</div>
              <div>5. Receive: Message acknowledgment</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1 text-[#c8dce8]">2. Real-time Data Stream</p>
            <div className="p-2 bg-[#1a2332] rounded font-mono text-[10px] space-y-1 text-[#7fa8c8]">
              <div>1. Connect to wss://api.example.com/stream</div>
              <div>2. Send: Subscribe request</div>
              <div>3. Receive (loop): Stream data updates</div>
              <div>4. Match: Filter specific events</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1 text-[#c8dce8]">3. Authenticated Connection</p>
            <div className="p-2 bg-[#1a2332] rounded font-mono text-[10px] space-y-1 text-[#7fa8c8]">
              <div>Headers: Authorization: Bearer ${'${token}'}</div>
              <div>Connect with authentication</div>
              <div>Exchange authenticated messages</div>
            </div>
          </div>
        </div>
      </details>

      <div className="p-3 bg-[#0b0f18] border border-[#1a2332] rounded-lg space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[#c8dce8]">
          <MessageCircle className="h-4 w-4" />
          Output Format
        </div>
        <div className="text-xs text-[#4a6480] space-y-1">
          <div>• <span className="font-mono text-[#7fa8c8]">messages</span> - Array of all received messages</div>
          <div>• <span className="font-mono text-[#7fa8c8]">sent_count</span> - Number of messages sent</div>
          <div>• <span className="font-mono text-[#7fa8c8]">received_count</span> - Number of messages received</div>
          <div>• <span className="font-mono text-[#7fa8c8]">{'<save_as>'}</span> - Variables from save_as fields</div>
        </div>
      </div>
    </div>
  );
}
