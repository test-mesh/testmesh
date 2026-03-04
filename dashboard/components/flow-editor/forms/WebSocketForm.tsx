'use client';

import { Radio, Send, MessageCircle, Filter } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
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
      <div className="flex items-center gap-2 pb-2 border-b">
        <Radio className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium">WebSocket</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Establish WebSocket connections, send messages, and validate received data.
        </p>
      </div>

      {/* URL */}
      <div className="space-y-2">
        <Label htmlFor="url">WebSocket URL</Label>
        <Input
          id="url"
          value={(config.url as string) || ''}
          onChange={(e) => onChange('url', e.target.value)}
          placeholder="ws://localhost:8080/chat"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Use ws:// or wss:// protocol. Supports variable interpolation.
        </p>
      </div>

      {/* Headers */}
      <KeyValueEditor
        label="Connection Headers"
        description="HTTP headers sent during WebSocket handshake"
        value={headers}
        onChange={(v) => onChange('headers', v)}
        keyPlaceholder="Authorization"
        valuePlaceholder="Bearer ${token}"
      />

      {/* Messages */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Message Sequence</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={addMessage}
            className="h-6 px-2 text-xs"
          >
            <Send className="w-3 h-3 mr-1" />
            Add Message
          </Button>
        </div>

        {messages.length === 0 ? (
          <div className="p-4 border rounded-lg bg-muted/30 text-center">
            <p className="text-sm text-muted-foreground">
              No messages configured. Add messages to send/receive.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, index) => (
              <div key={index} className="p-3 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Message {index + 1}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMessage(index)}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </Button>
                </div>

                {/* Message Type */}
                <div className="space-y-2">
                  <Label className="text-xs">Action</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={msg.type === 'send' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateMessage(index, { type: 'send' })}
                      className="flex-1 text-xs"
                    >
                      <Send className="w-3 h-3 mr-1" />
                      Send
                    </Button>
                    <Button
                      variant={msg.type === 'receive' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateMessage(index, { type: 'receive' })}
                      className="flex-1 text-xs"
                    >
                      <MessageCircle className="w-3 h-3 mr-1" />
                      Receive
                    </Button>
                  </div>
                </div>

                {msg.type === 'send' && (
                  <>
                    {/* Send Data */}
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

                    {/* Delay */}
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
                    {/* Timeout */}
                    <div className="space-y-2">
                      <Label className="text-xs">Timeout</Label>
                      <Input
                        value={msg.timeout || '5s'}
                        onChange={(e) => updateMessage(index, { timeout: e.target.value })}
                        placeholder="5s"
                        className="font-mono text-xs h-7"
                      />
                    </div>

                    {/* Match Pattern */}
                    <div className="space-y-2">
                      <Label className="text-xs">Match Pattern (Optional)</Label>
                      <Input
                        value={msg.match || ''}
                        onChange={(e) => updateMessage(index, { match: e.target.value })}
                        placeholder='$.type == "response"'
                        className="font-mono text-xs h-7"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        JSONPath expression to match specific messages
                      </p>
                    </div>

                    {/* Save As */}
                    <div className="space-y-2">
                      <Label className="text-xs">Save As (Optional)</Label>
                      <Input
                        value={msg.save_as || ''}
                        onChange={(e) => updateMessage(index, { save_as: e.target.value })}
                        placeholder="response_data"
                        className="font-mono text-xs h-7"
                      />
                      <p className="text-[10px] text-muted-foreground">
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

      {/* Connection Options */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Connection Options
        </summary>
        <div className="pt-3 space-y-3">
          {/* Connection Timeout */}
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

          {/* Ping Interval */}
          <div className="space-y-2">
            <Label htmlFor="ping_interval">Ping Interval</Label>
            <Input
              id="ping_interval"
              value={(config.ping_interval as string) || '30s'}
              onChange={(e) => onChange('ping_interval', e.target.value)}
              placeholder="30s"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Send ping frames to keep connection alive. 0s = disabled.
            </p>
          </div>

          {/* Max Message Size */}
          <div className="space-y-2">
            <Label htmlFor="max_message_size">Max Message Size (bytes)</Label>
            <Input
              id="max_message_size"
              type="number"
              value={(config.max_message_size as number) || 1048576}
              onChange={(e) => onChange('max_message_size', parseInt(e.target.value))}
              placeholder="1048576"
            />
            <p className="text-xs text-muted-foreground">
              Default: 1MB (1048576 bytes)
            </p>
          </div>

          {/* Close After Messages */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-close Connection</Label>
              <p className="text-xs text-muted-foreground">
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

      {/* Examples */}
      <details className="space-y-2 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Example Use Cases
        </summary>
        <div className="pt-2 space-y-3 text-xs">
          <div>
            <p className="font-medium mb-1">1. Chat Message Flow</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>1. Connect to ws://chat.example.com/room/123</div>
              <div>2. Send: {'{'} "type": "join" {'}'}</div>
              <div>3. Receive: Welcome message</div>
              <div>4. Send: {'{'} "type": "msg", "text": "Hello" {'}'}</div>
              <div>5. Receive: Message acknowledgment</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">2. Real-time Data Stream</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>1. Connect to wss://api.example.com/stream</div>
              <div>2. Send: Subscribe request</div>
              <div>3. Receive (loop): Stream data updates</div>
              <div>4. Match: Filter specific events</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">3. Authenticated Connection</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Headers: Authorization: Bearer ${'${token}'}</div>
              <div>Connect with authentication</div>
              <div>Exchange authenticated messages</div>
            </div>
          </div>
        </div>
      </details>

      {/* Output Info */}
      <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageCircle className="h-4 w-4" />
          Output Format
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• <span className="font-mono">messages</span> - Array of all received messages</div>
          <div>• <span className="font-mono">sent_count</span> - Number of messages sent</div>
          <div>• <span className="font-mono">received_count</span> - Number of messages received</div>
          <div>• <span className="font-mono">{'<save_as>'}</span> - Variables from save_as fields</div>
        </div>
      </div>
    </div>
  );
}
