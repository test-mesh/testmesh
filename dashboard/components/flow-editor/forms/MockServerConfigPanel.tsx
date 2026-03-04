'use client';

import { useState } from 'react';
import {
  Server,
  Plus,
  Trash2,
  Copy,
  CheckCircle,
  FileJson,
  Code,
  GitBranch,
  Database,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface MockEndpoint {
  id?: string;
  path: string;
  method: string;
  description?: string;

  // Request Matching
  match?: {
    headers?: Record<string, string>;
    query_params?: Record<string, string>;
    body_pattern?: string; // Regex or JSONPath
    body_contains?: string;
  };

  // Response Configuration
  response: {
    status: number;
    headers?: Record<string, string>;
    body?: any;
    body_template?: string; // Template with variables
    delay?: number; // Delay in milliseconds
  };

  // State Management
  state?: {
    key?: string;
    initial_value?: any;
    update_on_request?: string; // Expression to update state
    condition?: string; // Condition to match based on state
  };

  // Advanced Options
  priority?: number;
  enabled?: boolean;
  max_calls?: number; // Limit number of times this endpoint can be called
  scenarios?: MockScenario[]; // Multiple response scenarios
}

export interface MockScenario {
  name: string;
  condition: string; // Expression to determine if this scenario applies
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

  // Global Settings
  default_delay?: number;
  enable_cors?: boolean;
  enable_logging?: boolean;
  record_requests?: boolean;

  // State
  initial_state?: Record<string, any>;
}

interface MockServerConfigPanelProps {
  config: MockServerConfig;
  onChange: (config: MockServerConfig) => void;
  className?: string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const RESPONSE_TEMPLATES = {
  success: {
    status: 200,
    body: { success: true, message: 'Operation successful', data: {} },
  },
  created: {
    status: 201,
    body: { success: true, message: 'Resource created', id: '${generateId()}' },
  },
  error: {
    status: 400,
    body: { success: false, error: 'Bad request', message: 'Invalid input' },
  },
  notFound: {
    status: 404,
    body: { success: false, error: 'Not found', message: 'Resource not found' },
  },
  unauthorized: {
    status: 401,
    body: { success: false, error: 'Unauthorized', message: 'Authentication required' },
  },
  serverError: {
    status: 500,
    body: { success: false, error: 'Internal server error', message: 'Something went wrong' },
  },
};

export default function MockServerConfigPanel({
  config,
  onChange,
  className,
}: MockServerConfigPanelProps) {
  const [selectedEndpoint, setSelectedEndpoint] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['basic']));

  const updateConfig = (updates: Partial<MockServerConfig>) => {
    onChange({ ...config, ...updates });
  };

  const addEndpoint = () => {
    const newEndpoint: MockEndpoint = {
      path: '/new-endpoint',
      method: 'GET',
      response: {
        status: 200,
        body: { message: 'Hello from mock server' },
      },
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
    if (selectedEndpoint === index) {
      setSelectedEndpoint(null);
    }
  };

  const duplicateEndpoint = (index: number) => {
    const endpoint = { ...config.endpoints[index] };
    endpoint.path = `${endpoint.path}_copy`;
    updateConfig({ endpoints: [...config.endpoints, endpoint] });
  };

  const applyTemplate = (index: number, templateKey: keyof typeof RESPONSE_TEMPLATES) => {
    const template = RESPONSE_TEMPLATES[templateKey];
    updateEndpoint(index, {
      response: {
        ...config.endpoints[index].response,
        ...template,
      },
    });
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Server className="h-4 w-4 text-pink-500" />
        <span className="text-sm font-medium">Mock Server Configuration</span>
      </div>

      <div className="p-3 bg-pink-50 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900 rounded-lg">
        <p className="text-sm text-pink-900 dark:text-pink-300">
          Configure a mock API server with advanced features like state management, conditional
          responses, and request verification.
        </p>
      </div>

      <Tabs defaultValue="endpoints" className="w-full">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="endpoints" className="text-xs">
            <Server className="w-3 h-3 mr-1" />
            Endpoints ({config.endpoints.length})
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs">
            Settings
          </TabsTrigger>
          <TabsTrigger value="state" className="text-xs">
            <Database className="w-3 h-3 mr-1" />
            State
          </TabsTrigger>
        </TabsList>

        {/* Endpoints Tab */}
        <TabsContent value="endpoints" className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Define mock API endpoints with custom responses
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={addEndpoint}
              className="h-7 text-xs gap-1"
            >
              <Plus className="w-3 h-3" />
              Add Endpoint
            </Button>
          </div>

          {config.endpoints.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg">
              <Server className="w-12 h-12 text-muted-foreground mb-3" />
              <h3 className="font-semibold mb-1">No endpoints defined</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Add your first mock endpoint to get started
              </p>
              <Button variant="outline" size="sm" onClick={addEndpoint}>
                <Plus className="w-4 h-4 mr-1" />
                Add Endpoint
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-2">
              <div className="space-y-2">
                {config.endpoints.map((endpoint, index) => (
                  <div
                    key={index}
                    className={cn(
                      'border rounded-lg transition-colors',
                      selectedEndpoint === index && 'border-primary bg-primary/5'
                    )}
                  >
                    {selectedEndpoint === index ? (
                      /* Editing Mode */
                      <div className="p-3 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-sm">Edit Endpoint</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedEndpoint(null)}
                            className="h-6 text-xs"
                          >
                            Done
                          </Button>
                        </div>

                        {/* Method and Path */}
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

                        {/* Description */}
                        <div className="space-y-1">
                          <Label className="text-xs">Description (Optional)</Label>
                          <Input
                            value={endpoint.description || ''}
                            onChange={(e) => updateEndpoint(index, { description: e.target.value })}
                            placeholder="What does this endpoint do?"
                            className="h-7 text-xs"
                          />
                        </div>

                        {/* Response */}
                        <Collapsible
                          open={expandedSections.has(`response-${index}`)}
                          onOpenChange={() => toggleSection(`response-${index}`)}
                        >
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium hover:text-primary transition-colors">
                            {expandedSections.has(`response-${index}`) ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            Response Configuration
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-2">
                            {/* Response Templates */}
                            <div className="flex flex-wrap gap-1">
                              <span className="text-[10px] text-muted-foreground mr-1">
                                Quick:
                              </span>
                              {Object.keys(RESPONSE_TEMPLATES).map((key) => (
                                <button
                                  key={key}
                                  onClick={() =>
                                    applyTemplate(index, key as keyof typeof RESPONSE_TEMPLATES)
                                  }
                                  className="text-[10px] px-2 py-0.5 bg-muted hover:bg-muted/80 rounded transition-colors"
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
                                      response: {
                                        ...endpoint.response,
                                        status: parseInt(e.target.value) || 200,
                                      },
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
                                    const parsed = JSON.parse(e.target.value);
                                    updateEndpoint(index, {
                                      response: { ...endpoint.response, body: parsed },
                                    });
                                  } catch {
                                    updateEndpoint(index, {
                                      response: { ...endpoint.response, body: e.target.value },
                                    });
                                  }
                                }}
                                rows={6}
                                className="font-mono text-xs"
                              />
                            </div>
                          </CollapsibleContent>
                        </Collapsible>

                        {/* Request Matching */}
                        <Collapsible
                          open={expandedSections.has(`match-${index}`)}
                          onOpenChange={() => toggleSection(`match-${index}`)}
                        >
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium hover:text-primary transition-colors">
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
                                  updateEndpoint(index, {
                                    match: { ...endpoint.match, body_contains: e.target.value },
                                  })
                                }
                                placeholder='{"user_id": 123}'
                                className="h-7 text-xs font-mono"
                              />
                              <p className="text-[10px] text-muted-foreground">
                                Match requests containing this JSON structure
                              </p>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">Body Pattern (Regex)</Label>
                              <Input
                                value={endpoint.match?.body_pattern || ''}
                                onChange={(e) =>
                                  updateEndpoint(index, {
                                    match: { ...endpoint.match, body_pattern: e.target.value },
                                  })
                                }
                                placeholder="^user_.*"
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                          </CollapsibleContent>
                        </Collapsible>

                        {/* State Management */}
                        <Collapsible
                          open={expandedSections.has(`state-${index}`)}
                          onOpenChange={() => toggleSection(`state-${index}`)}
                        >
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium hover:text-primary transition-colors">
                            {expandedSections.has(`state-${index}`) ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            <Database className="w-3 h-3" />
                            State Management
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-2">
                            <div className="p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded text-xs text-blue-900 dark:text-blue-300">
                              Track state across requests (e.g., call counter, user sessions)
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">State Key</Label>
                              <Input
                                value={endpoint.state?.key || ''}
                                onChange={(e) =>
                                  updateEndpoint(index, {
                                    state: { ...endpoint.state, key: e.target.value },
                                  })
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
                                  updateEndpoint(index, {
                                    state: { ...endpoint.state, update_on_request: e.target.value },
                                  })
                                }
                                placeholder="state.call_count + 1"
                                className="h-7 text-xs font-mono"
                              />
                              <p className="text-[10px] text-muted-foreground">
                                Expression to update state on each request
                              </p>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>

                        {/* Options */}
                        <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <Label className="text-xs">Enabled</Label>
                          <Switch
                            checked={endpoint.enabled !== false}
                            onCheckedChange={(checked) => updateEndpoint(index, { enabled: checked })}
                          />
                        </div>
                      </div>
                    ) : (
                      /* Display Mode */
                      <div className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={cn(
                                  'text-xs font-mono font-medium px-2 py-0.5 rounded',
                                  endpoint.method === 'GET' &&
                                    'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                                  endpoint.method === 'POST' &&
                                    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                                  endpoint.method === 'PUT' &&
                                    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
                                  endpoint.method === 'DELETE' &&
                                    'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                )}
                              >
                                {endpoint.method}
                              </span>
                              <span className="font-mono text-sm truncate">{endpoint.path}</span>
                            </div>
                            {endpoint.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {endpoint.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                Status: {endpoint.response.status}
                              </span>
                              {endpoint.response.delay && (
                                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" />
                                  {endpoint.response.delay}ms
                                </span>
                              )}
                              {!endpoint.enabled && (
                                <span className="text-xs text-amber-600 dark:text-amber-400">
                                  Disabled
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedEndpoint(index)}
                              className="h-6 w-6 p-0"
                            >
                              <span className="sr-only">Edit</span>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => duplicateEndpoint(index)}
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeEndpoint(index)}
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-3 mt-4">
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
                onChange={(e) =>
                  updateConfig({ port: e.target.value ? parseInt(e.target.value) : undefined })
                }
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
            <p className="text-xs text-muted-foreground">
              Prefix all endpoint paths with this base path
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default-delay">Default Response Delay (ms)</Label>
            <Input
              id="default-delay"
              type="number"
              value={config.default_delay || ''}
              onChange={(e) =>
                updateConfig({
                  default_delay: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              placeholder="0"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Enable CORS</Label>
                <p className="text-xs text-muted-foreground">
                  Allow cross-origin requests
                </p>
              </div>
              <Switch
                checked={config.enable_cors !== false}
                onCheckedChange={(checked) => updateConfig({ enable_cors: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Enable Request Logging</Label>
                <p className="text-xs text-muted-foreground">
                  Log all incoming requests
                </p>
              </div>
              <Switch
                checked={config.enable_logging !== false}
                onCheckedChange={(checked) => updateConfig({ enable_logging: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Record Requests</Label>
                <p className="text-xs text-muted-foreground">
                  Save request history for verification
                </p>
              </div>
              <Switch
                checked={config.record_requests || false}
                onCheckedChange={(checked) => updateConfig({ record_requests: checked })}
              />
            </div>
          </div>
        </TabsContent>

        {/* State Tab */}
        <TabsContent value="state" className="space-y-3 mt-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-300">
              Define initial state values that endpoints can read and modify across requests.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="initial-state">Initial State (JSON)</Label>
            <Textarea
              id="initial-state"
              value={
                config.initial_state
                  ? JSON.stringify(config.initial_state, null, 2)
                  : ''
              }
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
            <p className="text-xs text-muted-foreground">
              State is shared across all endpoints and persists during server lifetime
            </p>
          </div>

          <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
            <div className="font-medium text-sm flex items-center gap-2">
              <Code className="w-4 h-4" />
              State Usage Examples
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="p-2 bg-background rounded">
                <div className="text-muted-foreground mb-1">// Access state in response:</div>
                <div>{'{"count": "${state.call_count}"}'}</div>
              </div>
              <div className="p-2 bg-background rounded">
                <div className="text-muted-foreground mb-1">// Update state:</div>
                <div>state.call_count + 1</div>
              </div>
              <div className="p-2 bg-background rounded">
                <div className="text-muted-foreground mb-1">// Conditional response:</div>
                <div>state.call_count {'>'} 3</div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
