'use client';

import { useState } from 'react';
import {
  Server,
  Plus,
  Trash2,
  Copy,
  Code,
  Database,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface MockEndpoint {
  id?: string;
  path: string;
  method: string;
  description?: string;
  match?: {
    headers?: Record<string, string>;
    query_params?: Record<string, string>;
    body_pattern?: string;
    body_contains?: string;
  };
  response: {
    status: number;
    headers?: Record<string, string>;
    body?: any;
    body_template?: string;
    delay?: number;
  };
  state?: {
    key?: string;
    initial_value?: any;
    update_on_request?: string;
    condition?: string;
  };
  priority?: number;
  enabled?: boolean;
  max_calls?: number;
  scenarios?: MockScenario[];
}

export interface MockScenario {
  name: string;
  condition: string;
  response: {
    status: number;
    body?: any;
    delay?: number;
  };
}

export interface MockServerConfig {
  name: string;
  port?: number;
  base_path?: string;
  endpoints: MockEndpoint[];
  default_delay?: number;
  enable_cors?: boolean;
  enable_logging?: boolean;
  record_requests?: boolean;
  initial_state?: Record<string, any>;
}

interface MockServerConfigPanelProps {
  config: MockServerConfig;
  onChange: (config: MockServerConfig) => void;
  className?: string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const RESPONSE_TEMPLATES = {
  success: { status: 200, body: { success: true, message: 'Operation successful', data: {} } },
  created: { status: 201, body: { success: true, message: 'Resource created', id: '${generateId()}' } },
  error: { status: 400, body: { success: false, error: 'Bad request', message: 'Invalid input' } },
  notFound: { status: 404, body: { success: false, error: 'Not found', message: 'Resource not found' } },
  unauthorized: { status: 401, body: { success: false, error: 'Unauthorized', message: 'Authentication required' } },
  serverError: { status: 500, body: { success: false, error: 'Internal server error', message: 'Something went wrong' } },
};

type MockTab = 'endpoints' | 'settings' | 'state';

const methodColor = (method: string) => {
  switch (method) {
    case 'GET': return 'bg-green-400/15 text-green-400';
    case 'POST': return 'bg-teal-400/10 text-teal-400';
    case 'PUT': return 'bg-yellow-400/15 text-yellow-400';
    case 'DELETE': return 'bg-red-400/15 text-red-400';
    default: return 'bg-[#1a2332] text-[#7fa8c8]';
  }
};

export default function MockServerConfigPanel({
  config,
  onChange,
  className,
}: MockServerConfigPanelProps) {
  const [selectedEndpoint, setSelectedEndpoint] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['basic']));
  const [activeTab, setActiveTab] = useState<MockTab>('endpoints');

  const updateConfig = (updates: Partial<MockServerConfig>) => {
    onChange({ ...config, ...updates });
  };

  const addEndpoint = () => {
    const newEndpoint: MockEndpoint = {
      path: '/new-endpoint',
      method: 'GET',
      response: { status: 200, body: { message: 'Hello from mock server' } },
      enabled: true,
      priority: config.endpoints.length,
    };
    updateConfig({ endpoints: [...config.endpoints, newEndpoint] });
    setSelectedEndpoint(config.endpoints.length);
  };

  const updateEndpoint = (index: number, updates: Partial<MockEndpoint>) => {
    const endpoints = [...config.endpoints];
    endpoints[index] = { ...endpoints[index], ...updates };
    updateConfig({ endpoints });
  };

  const removeEndpoint = (index: number) => {
    const endpoints = config.endpoints.filter((_, i) => i !== index);
    updateConfig({ endpoints });
    if (selectedEndpoint === index) setSelectedEndpoint(null);
  };

  const duplicateEndpoint = (index: number) => {
    const endpoint = { ...config.endpoints[index] };
    endpoint.path = `${endpoint.path}_copy`;
    updateConfig({ endpoints: [...config.endpoints, endpoint] });
  };

  const applyTemplate = (index: number, templateKey: keyof typeof RESPONSE_TEMPLATES) => {
    const template = RESPONSE_TEMPLATES[templateKey];
    updateEndpoint(index, { response: { ...config.endpoints[index].response, ...template } });
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) newExpanded.delete(section);
    else newExpanded.add(section);
    setExpandedSections(newExpanded);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b border-[#1a2332]">
        <Server className="h-4 w-4 text-pink-400" />
        <span className="text-sm font-medium text-[#c8dce8]">Mock Server Configuration</span>
      </div>

      <div className="p-3 bg-pink-400/5 border border-pink-400/20 rounded-lg">
        <p className="text-sm text-[#c8dce8]">
          Configure a mock API server with advanced features like state management, conditional
          responses, and request verification.
        </p>
      </div>

      {/* Tab pills */}
      <div className="flex gap-1 p-1 bg-[#0f1923] rounded-lg border border-[#1e2d3d]">
        <button
          type="button"
          onClick={() => setActiveTab('endpoints')}
          className={cn(
            'flex items-center gap-1 flex-1 h-7 px-2 rounded text-xs font-medium transition-colors',
            activeTab === 'endpoints' ? 'bg-[#1a2332] text-[#c8dce8]' : 'text-[#4a6480] hover:text-[#7fa8c8]'
          )}
        >
          <Server className="w-3 h-3" />
          Endpoints ({config.endpoints.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={cn(
            'flex-1 h-7 px-2 rounded text-xs font-medium transition-colors',
            activeTab === 'settings' ? 'bg-[#1a2332] text-[#c8dce8]' : 'text-[#4a6480] hover:text-[#7fa8c8]'
          )}
        >
          Settings
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('state')}
          className={cn(
            'flex items-center gap-1 flex-1 h-7 px-2 rounded text-xs font-medium transition-colors',
            activeTab === 'state' ? 'bg-[#1a2332] text-[#c8dce8]' : 'text-[#4a6480] hover:text-[#7fa8c8]'
          )}
        >
          <Database className="w-3 h-3" />
          State
        </button>
      </div>

      {/* Endpoints Tab */}
      {activeTab === 'endpoints' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#4a6480]">
              Define mock API endpoints with custom responses
            </p>
            <button
              type="button"
              onClick={addEndpoint}
              className="flex items-center gap-1 h-7 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Endpoint
            </button>
          </div>

          {config.endpoints.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 border border-dashed border-[#1e2d3d] rounded-lg">
              <Server className="w-12 h-12 text-[#3d5670] mb-3" />
              <h3 className="font-semibold text-[#c8dce8] mb-1">No endpoints defined</h3>
              <p className="text-sm text-[#4a6480] mb-3">
                Add your first mock endpoint to get started
              </p>
              <button
                type="button"
                onClick={addEndpoint}
                className="flex items-center gap-1 h-7 px-3 rounded border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Endpoint
              </button>
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-2">
              <div className="space-y-2">
                {config.endpoints.map((endpoint, index) => (
                  <div
                    key={index}
                    className={cn(
                      'border rounded-lg transition-colors',
                      selectedEndpoint === index
                        ? 'border-teal-400/30 bg-teal-400/5'
                        : 'border-[#1a2332] bg-[#0b0f18]'
                    )}
                  >
                    {selectedEndpoint === index ? (
                      <div className="p-3 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-sm text-[#c8dce8]">Edit Endpoint</h4>
                          <button
                            type="button"
                            onClick={() => setSelectedEndpoint(null)}
                            className="flex items-center h-6 px-2 rounded text-xs text-[#7fa8c8] hover:text-[#c8dce8] hover:bg-[#1a2d3d] transition-colors"
                          >
                            Done
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Method</Label>
                            <Select
                              value={endpoint.method}
                              onValueChange={(v) => updateEndpoint(index, { method: v })}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {HTTP_METHODS.map((method) => (
                                  <SelectItem key={method} value={method} className="text-xs">
                                    {method}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Path</Label>
                            <Input
                              value={endpoint.path}
                              onChange={(e) => updateEndpoint(index, { path: e.target.value })}
                              placeholder="/api/users/:id"
                              className="h-7 text-xs font-mono"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Description (Optional)</Label>
                          <Input
                            value={endpoint.description || ''}
                            onChange={(e) => updateEndpoint(index, { description: e.target.value })}
                            placeholder="What does this endpoint do?"
                            className="h-7 text-xs"
                          />
                        </div>

                        <Collapsible
                          open={expandedSections.has(`response-${index}`)}
                          onOpenChange={() => toggleSection(`response-${index}`)}
                        >
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-[#7fa8c8] hover:text-[#c8dce8] transition-colors">
                            {expandedSections.has(`response-${index}`) ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            Response Configuration
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-2">
                            <div className="flex flex-wrap gap-1">
                              <span className="text-[10px] text-[#4a6480] mr-1">Quick:</span>
                              {Object.keys(RESPONSE_TEMPLATES).map((key) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => applyTemplate(index, key as keyof typeof RESPONSE_TEMPLATES)}
                                  className="text-[10px] px-2 py-0.5 bg-[#1a2332] hover:bg-[#1e2d3d] text-[#7fa8c8] rounded transition-colors"
                                >
                                  {key}
                                </button>
                              ))}
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Status Code</Label>
                                <Input
                                  type="number"
                                  value={endpoint.response.status}
                                  onChange={(e) =>
                                    updateEndpoint(index, {
                                      response: { ...endpoint.response, status: parseInt(e.target.value) || 200 },
                                    })
                                  }
                                  className="h-7 text-xs font-mono"
                                />
                              </div>
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Delay (ms)
                                </Label>
                                <Input
                                  type="number"
                                  value={endpoint.response.delay || ''}
                                  onChange={(e) =>
                                    updateEndpoint(index, {
                                      response: {
                                        ...endpoint.response,
                                        delay: e.target.value ? parseInt(e.target.value) : undefined,
                                      },
                                    })
                                  }
                                  placeholder="0"
                                  className="h-7 text-xs font-mono"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">Response Body (JSON)</Label>
                              <Textarea
                                value={
                                  typeof endpoint.response.body === 'string'
                                    ? endpoint.response.body
                                    : JSON.stringify(endpoint.response.body, null, 2)
                                }
                                onChange={(e) => {
                                  try {
                                    updateEndpoint(index, { response: { ...endpoint.response, body: JSON.parse(e.target.value) } });
                                  } catch {
                                    updateEndpoint(index, { response: { ...endpoint.response, body: e.target.value } });
                                  }
                                }}
                                rows={6}
                                className="font-mono text-xs"
                              />
                            </div>
                          </CollapsibleContent>
                        </Collapsible>

                        <Collapsible
                          open={expandedSections.has(`match-${index}`)}
                          onOpenChange={() => toggleSection(`match-${index}`)}
                        >
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-[#7fa8c8] hover:text-[#c8dce8] transition-colors">
                            {expandedSections.has(`match-${index}`) ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            Request Matching (Advanced)
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Body Contains</Label>
                              <Input
                                value={endpoint.match?.body_contains || ''}
                                onChange={(e) =>
                                  updateEndpoint(index, { match: { ...endpoint.match, body_contains: e.target.value } })
                                }
                                placeholder='{"user_id": 123}'
                                className="h-7 text-xs font-mono"
                              />
                              <p className="text-[10px] text-[#4a6480]">
                                Match requests containing this JSON structure
                              </p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Body Pattern (Regex)</Label>
                              <Input
                                value={endpoint.match?.body_pattern || ''}
                                onChange={(e) =>
                                  updateEndpoint(index, { match: { ...endpoint.match, body_pattern: e.target.value } })
                                }
                                placeholder="^user_.*"
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                          </CollapsibleContent>
                        </Collapsible>

                        <Collapsible
                          open={expandedSections.has(`state-${index}`)}
                          onOpenChange={() => toggleSection(`state-${index}`)}
                        >
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-[#7fa8c8] hover:text-[#c8dce8] transition-colors">
                            {expandedSections.has(`state-${index}`) ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            <Database className="w-3 h-3" />
                            State Management
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-2">
                            <div className="p-2 bg-teal-400/5 border border-teal-400/20 rounded text-xs text-[#c8dce8]">
                              Track state across requests (e.g., call counter, user sessions)
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">State Key</Label>
                              <Input
                                value={endpoint.state?.key || ''}
                                onChange={(e) =>
                                  updateEndpoint(index, { state: { ...endpoint.state, key: e.target.value } })
                                }
                                placeholder="call_count"
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Update Expression</Label>
                              <Input
                                value={endpoint.state?.update_on_request || ''}
                                onChange={(e) =>
                                  updateEndpoint(index, { state: { ...endpoint.state, update_on_request: e.target.value } })
                                }
                                placeholder="state.call_count + 1"
                                className="h-7 text-xs font-mono"
                              />
                              <p className="text-[10px] text-[#4a6480]">
                                Expression to update state on each request
                              </p>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>

                        <div className="flex items-center justify-between p-2 bg-[#0b0f18] border border-[#1a2332] rounded">
                          <Label className="text-xs">Enabled</Label>
                          <Switch
                            checked={endpoint.enabled !== false}
                            onCheckedChange={(checked) => updateEndpoint(index, { enabled: checked })}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn('text-xs font-mono font-medium px-2 py-0.5 rounded', methodColor(endpoint.method))}>
                                {endpoint.method}
                              </span>
                              <span className="font-mono text-sm truncate text-[#c8dce8]">{endpoint.path}</span>
                            </div>
                            {endpoint.description && (
                              <p className="text-xs text-[#4a6480] truncate">{endpoint.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-[#4a6480]">
                                Status: {endpoint.response.status}
                              </span>
                              {endpoint.response.delay && (
                                <span className="text-xs text-[#4a6480] flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" />
                                  {endpoint.response.delay}ms
                                </span>
                              )}
                              {!endpoint.enabled && (
                                <span className="text-xs text-amber-400">Disabled</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              type="button"
                              onClick={() => setSelectedEndpoint(index)}
                              className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                            >
                              <span className="sr-only">Edit</span>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => duplicateEndpoint(index)}
                              className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeEndpoint(index)}
                              className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="server-name">Server Name</Label>
              <Input
                id="server-name"
                value={config.name}
                onChange={(e) => updateConfig({ name: e.target.value })}
                placeholder="my_mock_server"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="server-port">Port</Label>
              <Input
                id="server-port"
                type="number"
                value={config.port || ''}
                onChange={(e) => updateConfig({ port: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="8080"
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="base-path">Base Path</Label>
            <Input
              id="base-path"
              value={config.base_path || ''}
              onChange={(e) => updateConfig({ base_path: e.target.value })}
              placeholder="/api/v1"
              className="font-mono text-sm"
            />
            <p className="text-xs text-[#4a6480]">
              Prefix all endpoint paths with this base path
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default-delay">Default Response Delay (ms)</Label>
            <Input
              id="default-delay"
              type="number"
              value={config.default_delay || ''}
              onChange={(e) => updateConfig({ default_delay: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="0"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-3 pt-3 border-t border-[#1e2d3d]">
            {[
              { id: 'cors', label: 'Enable CORS', desc: 'Allow cross-origin requests', key: 'enable_cors' as const, val: config.enable_cors !== false },
              { id: 'logging', label: 'Enable Request Logging', desc: 'Log all incoming requests', key: 'enable_logging' as const, val: config.enable_logging !== false },
              { id: 'record', label: 'Record Requests', desc: 'Save request history for verification', key: 'record_requests' as const, val: config.record_requests || false },
            ].map(({ id, label, desc, key, val }) => (
              <div key={id} className="flex items-center justify-between p-3 border border-[#1e2d3d] rounded-lg">
                <div>
                  <Label>{label}</Label>
                  <p className="text-xs text-[#4a6480]">{desc}</p>
                </div>
                <Switch
                  checked={val}
                  onCheckedChange={(checked) => updateConfig({ [key]: checked })}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* State Tab */}
      {activeTab === 'state' && (
        <div className="space-y-3">
          <div className="p-3 bg-teal-400/5 border border-teal-400/20 rounded-lg">
            <p className="text-sm text-[#c8dce8]">
              Define initial state values that endpoints can read and modify across requests.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="initial-state">Initial State (JSON)</Label>
            <Textarea
              id="initial-state"
              value={config.initial_state ? JSON.stringify(config.initial_state, null, 2) : ''}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value || '{}');
                  updateConfig({ initial_state: parsed });
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              placeholder={'{\n  "call_count": 0,\n  "users": []\n}'}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-xs text-[#4a6480]">
              State is shared across all endpoints and persists during server lifetime
            </p>
          </div>

          <div className="p-3 bg-[#0b0f18] border border-[#1a2332] rounded-lg space-y-2">
            <div className="font-medium text-sm text-[#c8dce8] flex items-center gap-2">
              <Code className="w-4 h-4" />
              State Usage Examples
            </div>
            <div className="space-y-1 text-xs font-mono">
              {[
                { comment: '// Access state in response:', code: '{"count": "${state.call_count}"}' },
                { comment: '// Update state:', code: 'state.call_count + 1' },
                { comment: '// Conditional response:', code: 'state.call_count > 3' },
              ].map(({ comment, code }, i) => (
                <div key={i} className="p-2 bg-[#0f1923] border border-[#1e2d3d] rounded">
                  <div className="text-[#4a6480] mb-1">{comment}</div>
                  <div className="text-[#7fa8c8]">{code}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
