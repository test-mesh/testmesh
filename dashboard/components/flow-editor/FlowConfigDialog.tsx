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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

type ConfigTab = 'metadata' | 'environment' | 'defaults';

const CONFIG_TABS: { value: ConfigTab; label: string; icon: React.ElementType }[] = [
  { value: 'metadata', label: 'Metadata', icon: Info },
  { value: 'environment', label: 'Environment', icon: Database },
  { value: 'defaults', label: 'Defaults', icon: Clock },
];

export default function FlowConfigDialog({
  definition,
  onChange,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: FlowConfigDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localDefinition, setLocalDefinition] = useState<FlowDefinition>({ ...definition, tags: definition.tags ?? [] });
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tab, setTab] = useState<ConfigTab>('metadata');

  const open = controlledOpen !== undefined ? controlledOpen : isOpen;
  const setOpen = onOpenChange || setIsOpen;

  useEffect(() => {
    if (definition.env) {
      setEnvVars(Object.entries(definition.env).map(([key, value]) => ({ key, value: String(value) })));
    } else {
      setEnvVars([]);
    }
    setLocalDefinition({ ...definition, tags: definition.tags ?? [] });
  }, [definition, open]);

  const handleSave = () => {
    const env: Record<string, string> = {};
    envVars.forEach(({ key, value }) => { if (key.trim()) env[key.trim()] = value; });
    onChange({ ...localDefinition, env: Object.keys(env).length > 0 ? env : undefined });
    setOpen(false);
  };

  const handleCancel = () => {
    setLocalDefinition({ ...definition, tags: definition.tags ?? [] });
    setOpen(false);
  };

  const addEnvVar = () => setEnvVars([...envVars, { key: '', value: '', isEditing: true }]);
  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...envVars];
    updated[index][field] = value;
    setEnvVars(updated);
  };
  const removeEnvVar = (index: number) => setEnvVars(envVars.filter((_, i) => i !== index));

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !localDefinition.tags.includes(tag)) {
      setLocalDefinition({ ...localDefinition, tags: [...localDefinition.tags, tag] });
      setTagInput('');
    }
  };
  const removeTag = (tag: string) =>
    setLocalDefinition({ ...localDefinition, tags: localDefinition.tags.filter((t) => t !== tag) });

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <button className="flex items-center gap-1.5 h-8 px-3 rounded text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
            <Settings2 className="w-3.5 h-3.5" />
            Flow Settings
          </button>
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

        {/* Tab bar */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0b0f18] border border-[#1e2d3d]">
          {CONFIG_TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                'flex items-center gap-1.5 flex-1 h-7 px-3 rounded-md text-xs font-medium transition-colors',
                tab === value ? 'bg-teal-400/15 text-teal-400' : 'text-[#4a6480] hover:text-[#7fa8c8]'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {/* Metadata Tab */}
          {tab === 'metadata' && (
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label htmlFor="flow-name" className="text-xs">Flow Name *</Label>
                <Input
                  id="flow-name"
                  value={localDefinition.name}
                  onChange={(e) => setLocalDefinition({ ...localDefinition, name: e.target.value })}
                  placeholder="My Test Flow"
                  className="font-medium"
                />
                <p className="text-[10px] text-[#4a6480]">A descriptive name for your flow</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="flow-description" className="text-xs">Description</Label>
                <Textarea
                  id="flow-description"
                  value={localDefinition.description}
                  onChange={(e) => setLocalDefinition({ ...localDefinition, description: e.target.value })}
                  placeholder="Describe what this flow tests or validates..."
                  rows={3}
                />
                <p className="text-[10px] text-[#4a6480]">Optional description of the flow's purpose</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="flow-suite" className="text-xs">Test Suite</Label>
                <Input
                  id="flow-suite"
                  value={localDefinition.suite}
                  onChange={(e) => setLocalDefinition({ ...localDefinition, suite: e.target.value })}
                  placeholder="api-tests, integration, smoke"
                  className="font-mono text-sm"
                />
                <p className="text-[10px] text-[#4a6480]">Group flows into test suites for organization</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="flow-tags" className="text-xs">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    id="flow-tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="Add a tag and press Enter"
                    className="font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    disabled={!tagInput.trim()}
                    className="flex items-center justify-center h-9 w-9 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-40 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {localDefinition.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {localDefinition.tags.map((tag) => (
                      <span key={tag} className="flex items-center gap-1 pl-2 pr-1 py-0.5 text-[10px] font-medium rounded border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8]">
                        <Tag className="w-3 h-3 text-[#4a6480]" />
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="ml-0.5 flex items-center justify-center h-3.5 w-3.5 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-[#4a6480]">Add tags for filtering and categorization</p>
              </div>
            </div>
          )}

          {/* Environment Tab */}
          {tab === 'environment' && (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-teal-400/5 border border-teal-400/20 rounded-lg">
                <p className="text-xs text-[#7fa8c8]">
                  Environment variables are available to all steps using{' '}
                  <code className="font-mono text-teal-400">{'${ENV_VAR_NAME}'}</code> syntax.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Environment Variables</Label>
                  <button
                    type="button"
                    onClick={addEnvVar}
                    className="flex items-center gap-1 h-7 px-3 rounded-lg text-xs border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Variable
                  </button>
                </div>

                {envVars.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[#4a6480] border border-dashed border-[#1e2d3d] rounded-lg">
                    No environment variables defined
                  </div>
                ) : (
                  <div className="space-y-2">
                    {envVars.map((envVar, index) => (
                      <div key={index} className="flex gap-2 items-start p-3 border border-[#1e2d3d] rounded-lg bg-[#0f1923]">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-[#4a6480]">Variable Name</Label>
                            <Input
                              value={envVar.key}
                              onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                              placeholder="API_URL"
                              className="font-mono text-sm h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-[#4a6480]">Value</Label>
                            <Input
                              value={envVar.value}
                              onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                              placeholder="https://api.example.com"
                              className="font-mono text-sm h-8"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeEnvVar(index)}
                          className="flex items-center justify-center h-8 w-8 mt-6 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <details className="space-y-2 p-3 border border-[#1e2d3d] rounded-lg">
                <summary className="text-xs font-medium text-[#7fa8c8] cursor-pointer">Common Environment Variables</summary>
                <div className="pt-2 space-y-2 text-xs">
                  {[
                    { title: 'API Configuration', lines: ['API_URL: https://api.example.com', 'API_KEY: your-api-key-here', 'API_TIMEOUT: 30s'] },
                    { title: 'Database', lines: ['DB_HOST: localhost:5432', 'DB_NAME: testdb', 'DB_USER: admin'] },
                    { title: 'Test Data', lines: ['TEST_USER_EMAIL: test@example.com', 'TEST_USER_PASSWORD: password123'] },
                  ].map(({ title, lines }) => (
                    <div key={title} className="p-2 bg-[#0b0f18] border border-[#1e2d3d] rounded-lg font-mono text-[10px]">
                      <div className="font-semibold mb-1 text-[#7fa8c8]">{title}</div>
                      {lines.map((l) => <div key={l} className="text-[#4a6480]">{l}</div>)}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Defaults Tab */}
          {tab === 'defaults' && (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-lg flex gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <p className="text-xs text-[#7fa8c8]">
                  Default settings apply to all steps in this flow unless overridden at the step level.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default-timeout" className="flex items-center gap-2 text-xs">
                  <Clock className="w-3.5 h-3.5 text-[#4a6480]" />
                  Default Step Timeout
                </Label>
                <Input
                  id="default-timeout"
                  value={(localDefinition as any).default_timeout || ''}
                  onChange={(e) => setLocalDefinition({ ...localDefinition, default_timeout: e.target.value } as any)}
                  placeholder="30s (e.g., 5s, 1m, 30s)"
                  className="font-mono text-sm"
                />
                <p className="text-[10px] text-[#4a6480]">Default timeout for all steps (e.g., 30s, 1m, 5m)</p>
              </div>

              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-xs">
                  <RotateCcw className="w-3.5 h-3.5 text-[#4a6480]" />
                  Default Retry Configuration
                </Label>
                <div className="space-y-3 pl-5 border-l-2 border-[#1a2332]">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="default-retry-enabled" className="text-xs text-[#7fa8c8]">Enable retry by default</Label>
                    <Switch
                      id="default-retry-enabled"
                      checked={!!(localDefinition as any).default_retry}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setLocalDefinition({ ...localDefinition, default_retry: { max_attempts: 3, delay: '1s', backoff: 'exponential' } } as any);
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
                        <Label htmlFor="default-max-attempts" className="text-[10px] text-[#4a6480]">Max Attempts</Label>
                        <Input
                          id="default-max-attempts"
                          type="number" min="1" max="10"
                          value={(localDefinition as any).default_retry.max_attempts || 3}
                          onChange={(e) => setLocalDefinition({ ...localDefinition, default_retry: { ...(localDefinition as any).default_retry, max_attempts: parseInt(e.target.value) || 3 } } as any)}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="default-retry-delay" className="text-[10px] text-[#4a6480]">Initial Delay</Label>
                        <Input
                          id="default-retry-delay"
                          value={(localDefinition as any).default_retry.delay || '1s'}
                          onChange={(e) => setLocalDefinition({ ...localDefinition, default_retry: { ...(localDefinition as any).default_retry, delay: e.target.value } } as any)}
                          placeholder="1s"
                          className="font-mono text-sm h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="default-retry-backoff" className="text-[10px] text-[#4a6480]">Backoff Strategy</Label>
                        <select
                          id="default-retry-backoff"
                          value={(localDefinition as any).default_retry.backoff || 'exponential'}
                          onChange={(e) => setLocalDefinition({ ...localDefinition, default_retry: { ...(localDefinition as any).default_retry, backoff: e.target.value } } as any)}
                          className="flex h-8 w-full rounded-lg border border-[#1e2d3d] bg-[#0b0f18] px-3 py-1 text-xs text-[#c8dce8] focus:outline-none focus:border-teal-400/50 transition-colors"
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

              <div className="space-y-3">
                <Label className="text-xs">Execution Settings</Label>
                <div className="space-y-3 pl-5 border-l-2 border-[#1a2332]">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="fail-fast" className="text-xs text-[#7fa8c8]">Fail Fast</Label>
                      <p className="text-[10px] text-[#4a6480]">Stop execution on first failure</p>
                    </div>
                    <Switch
                      id="fail-fast"
                      checked={(localDefinition as any).fail_fast || false}
                      onCheckedChange={(checked) => setLocalDefinition({ ...localDefinition, fail_fast: checked } as any)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="continue-on-error" className="text-xs text-[#7fa8c8]">Continue on Error</Label>
                      <p className="text-[10px] text-[#4a6480]">Continue execution even if steps fail</p>
                    </div>
                    <Switch
                      id="continue-on-error"
                      checked={(localDefinition as any).continue_on_error || false}
                      onCheckedChange={(checked) => setLocalDefinition({ ...localDefinition, continue_on_error: checked } as any)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={handleCancel}
            className="flex items-center h-8 px-4 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
          >
            Save Changes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
