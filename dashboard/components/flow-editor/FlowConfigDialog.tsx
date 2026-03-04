'use client';

import { useState, useEffect } from 'react';
import {
  Settings2,
  Plus,
  X,
  Tag,
  Clock,
  RotateCcw,
  Database,
  Info,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { FlowDefinition } from '@/lib/api/types';

interface FlowConfigDialogProps {
  definition: FlowDefinition;
  onChange: (definition: FlowDefinition) => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface EnvVar {
  key: string;
  value: string;
  isEditing?: boolean;
}

export default function FlowConfigDialog({
  definition,
  onChange,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: FlowConfigDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localDefinition, setLocalDefinition] = useState<FlowDefinition>(definition);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Use controlled or uncontrolled state
  const open = controlledOpen !== undefined ? controlledOpen : isOpen;
  const setOpen = onOpenChange || setIsOpen;

  // Initialize environment variables from definition
  useEffect(() => {
    if (definition.env) {
      const vars = Object.entries(definition.env).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setEnvVars(vars);
    } else {
      setEnvVars([]);
    }
    setLocalDefinition(definition);
  }, [definition, open]);

  const handleSave = () => {
    // Convert env vars array back to object
    const env: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      if (key.trim()) {
        env[key.trim()] = value;
      }
    });

    const updated: FlowDefinition = {
      ...localDefinition,
      env: Object.keys(env).length > 0 ? env : undefined,
    };

    onChange(updated);
    setOpen(false);
  };

  const handleCancel = () => {
    setLocalDefinition(definition);
    setOpen(false);
  };

  // Environment variable handlers
  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '', isEditing: true }]);
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...envVars];
    updated[index][field] = value;
    setEnvVars(updated);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  // Tag handlers
  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !localDefinition.tags.includes(tag)) {
      setLocalDefinition({
        ...localDefinition,
        tags: [...localDefinition.tags, tag],
      });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setLocalDefinition({
      ...localDefinition,
      tags: localDefinition.tags.filter((t) => t !== tag),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5">
            <Settings2 className="w-4 h-4" />
            Flow Settings
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Flow Configuration
          </DialogTitle>
          <DialogDescription>
            Configure flow-level settings, environment variables, and metadata
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="metadata" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="metadata" className="gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Metadata
            </TabsTrigger>
            <TabsTrigger value="environment" className="gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Environment
            </TabsTrigger>
            <TabsTrigger value="defaults" className="gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Defaults
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-2">
            {/* Metadata Tab */}
            <TabsContent value="metadata" className="space-y-4 mt-0">
              {/* Flow Name */}
              <div className="space-y-2">
                <Label htmlFor="flow-name">Flow Name *</Label>
                <Input
                  id="flow-name"
                  value={localDefinition.name}
                  onChange={(e) =>
                    setLocalDefinition({ ...localDefinition, name: e.target.value })
                  }
                  placeholder="My Test Flow"
                  className="font-medium"
                />
                <p className="text-xs text-muted-foreground">
                  A descriptive name for your flow
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="flow-description">Description</Label>
                <Textarea
                  id="flow-description"
                  value={localDefinition.description}
                  onChange={(e) =>
                    setLocalDefinition({ ...localDefinition, description: e.target.value })
                  }
                  placeholder="Describe what this flow tests or validates..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Optional description of the flow's purpose
                </p>
              </div>

              {/* Suite */}
              <div className="space-y-2">
                <Label htmlFor="flow-suite">Test Suite</Label>
                <Input
                  id="flow-suite"
                  value={localDefinition.suite}
                  onChange={(e) =>
                    setLocalDefinition({ ...localDefinition, suite: e.target.value })
                  }
                  placeholder="api-tests, integration, smoke"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Group flows into test suites for organization
                </p>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label htmlFor="flow-tags">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    id="flow-tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add a tag and press Enter"
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTag}
                    disabled={!tagInput.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {localDefinition.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {localDefinition.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 pl-2 pr-1 py-1"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="ml-1 hover:bg-muted rounded-sm p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Add tags for filtering and categorization
                </p>
              </div>
            </TabsContent>

            {/* Environment Tab */}
            <TabsContent value="environment" className="space-y-4 mt-0">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-300">
                  Environment variables are available to all steps in this flow using{' '}
                  <code className="font-mono">{'${ENV_VAR_NAME}'}</code> syntax.
                </p>
              </div>

              {/* Environment Variables List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Environment Variables</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addEnvVar}
                    className="h-8"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Variable
                  </Button>
                </div>

                {envVars.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg border-dashed">
                    No environment variables defined
                  </div>
                ) : (
                  <div className="space-y-2">
                    {envVars.map((envVar, index) => (
                      <div
                        key={index}
                        className="flex gap-2 items-start p-3 border rounded-lg bg-muted/30"
                      >
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              Variable Name
                            </Label>
                            <Input
                              value={envVar.key}
                              onChange={(e) =>
                                updateEnvVar(index, 'key', e.target.value)
                              }
                              placeholder="API_URL"
                              className="font-mono text-sm h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Value</Label>
                            <Input
                              value={envVar.value}
                              onChange={(e) =>
                                updateEnvVar(index, 'value', e.target.value)
                              }
                              placeholder="https://api.example.com"
                              className="font-mono text-sm h-8"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeEnvVar(index)}
                          className="h-8 w-8 p-0 mt-6"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Common Examples */}
              <details className="space-y-2 p-3 border rounded-lg">
                <summary className="text-sm font-medium cursor-pointer">
                  Common Environment Variables
                </summary>
                <div className="pt-2 space-y-2 text-xs">
                  <div className="p-2 bg-muted rounded font-mono text-[10px]">
                    <div className="font-semibold mb-1">API Configuration</div>
                    <div>API_URL: https://api.example.com</div>
                    <div>API_KEY: your-api-key-here</div>
                    <div>API_TIMEOUT: 30s</div>
                  </div>
                  <div className="p-2 bg-muted rounded font-mono text-[10px]">
                    <div className="font-semibold mb-1">Database</div>
                    <div>DB_HOST: localhost:5432</div>
                    <div>DB_NAME: testdb</div>
                    <div>DB_USER: admin</div>
                  </div>
                  <div className="p-2 bg-muted rounded font-mono text-[10px]">
                    <div className="font-semibold mb-1">Test Data</div>
                    <div>TEST_USER_EMAIL: test@example.com</div>
                    <div>TEST_USER_PASSWORD: password123</div>
                  </div>
                </div>
              </details>
            </TabsContent>

            {/* Defaults Tab */}
            <TabsContent value="defaults" className="space-y-4 mt-0">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-900 dark:text-amber-300">
                  Default settings apply to all steps in this flow unless overridden at the
                  step level. These settings are stored as flow-level configuration.
                </p>
              </div>

              {/* Global Timeout */}
              <div className="space-y-2">
                <Label htmlFor="default-timeout" className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Default Step Timeout
                </Label>
                <Input
                  id="default-timeout"
                  value={(localDefinition as any).default_timeout || ''}
                  onChange={(e) =>
                    setLocalDefinition({
                      ...localDefinition,
                      default_timeout: e.target.value,
                    } as any)
                  }
                  placeholder="30s (e.g., 5s, 1m, 30s)"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Default timeout for all steps (e.g., 30s, 1m, 5m)
                </p>
              </div>

              {/* Global Retry */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Default Retry Configuration
                </Label>
                <div className="space-y-3 pl-6 border-l-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="default-retry-enabled" className="text-sm">
                      Enable retry by default
                    </Label>
                    <Switch
                      id="default-retry-enabled"
                      checked={!!(localDefinition as any).default_retry}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setLocalDefinition({
                            ...localDefinition,
                            default_retry: {
                              max_attempts: 3,
                              delay: '1s',
                              backoff: 'exponential',
                            },
                          } as any);
                        } else {
                          const { default_retry, ...rest } = localDefinition as any;
                          setLocalDefinition(rest);
                        }
                      }}
                    />
                  </div>

                  {(localDefinition as any).default_retry && (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="default-max-attempts" className="text-xs">
                          Max Attempts
                        </Label>
                        <Input
                          id="default-max-attempts"
                          type="number"
                          min="1"
                          max="10"
                          value={(localDefinition as any).default_retry.max_attempts || 3}
                          onChange={(e) =>
                            setLocalDefinition({
                              ...localDefinition,
                              default_retry: {
                                ...(localDefinition as any).default_retry,
                                max_attempts: parseInt(e.target.value) || 3,
                              },
                            } as any)
                          }
                          className="h-8"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="default-retry-delay" className="text-xs">
                          Initial Delay
                        </Label>
                        <Input
                          id="default-retry-delay"
                          value={(localDefinition as any).default_retry.delay || '1s'}
                          onChange={(e) =>
                            setLocalDefinition({
                              ...localDefinition,
                              default_retry: {
                                ...(localDefinition as any).default_retry,
                                delay: e.target.value,
                              },
                            } as any)
                          }
                          placeholder="1s"
                          className="font-mono text-sm h-8"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="default-retry-backoff" className="text-xs">
                          Backoff Strategy
                        </Label>
                        <select
                          id="default-retry-backoff"
                          value={(localDefinition as any).default_retry.backoff || 'exponential'}
                          onChange={(e) =>
                            setLocalDefinition({
                              ...localDefinition,
                              default_retry: {
                                ...(localDefinition as any).default_retry,
                                backoff: e.target.value,
                              },
                            } as any)
                          }
                          className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="constant">Constant</option>
                          <option value="linear">Linear</option>
                          <option value="exponential">Exponential</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Execution Settings */}
              <div className="space-y-3">
                <Label>Execution Settings</Label>
                <div className="space-y-3 pl-6 border-l-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="fail-fast" className="text-sm">
                        Fail Fast
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Stop execution on first failure
                      </p>
                    </div>
                    <Switch
                      id="fail-fast"
                      checked={(localDefinition as any).fail_fast || false}
                      onCheckedChange={(checked) =>
                        setLocalDefinition({
                          ...localDefinition,
                          fail_fast: checked,
                        } as any)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="continue-on-error" className="text-sm">
                        Continue on Error
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Continue execution even if steps fail
                      </p>
                    </div>
                    <Switch
                      id="continue-on-error"
                      checked={(localDefinition as any).continue_on_error || false}
                      onCheckedChange={(checked) =>
                        setLocalDefinition({
                          ...localDefinition,
                          continue_on_error: checked,
                        } as any)
                      }
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
