'use client';

import { useState } from 'react';
import {
  Globe,
  Plus,
  Star,
  Copy,
  Download,
  Upload,
  Trash2,
  MoreVertical,
  Eye,
  EyeOff,
  Loader2,
  Variable,
  Check,
  X,
  Route,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  useEnvironments,
  useCreateEnvironment,
  useUpdateEnvironment,
  useDeleteEnvironment,
  useSetDefaultEnvironment,
  useDuplicateEnvironment,
  useExportEnvironment,
  useImportEnvironment,
} from '@/lib/hooks/useEnvironments';
import type { Environment, EnvironmentVariable, RoutingPolicy } from '@/lib/api/environments';

const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#6B7280', // Gray
  '#14B8A6', // Teal
];

export default function EnvironmentsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);
  const [formVariables, setFormVariables] = useState<EnvironmentVariable[]>([]);
  const [formRoutingHeaders, setFormRoutingHeaders] = useState<[string, string][]>([]);
  const [formRoutingServices, setFormRoutingServices] = useState<[string, string][]>([]);

  const { data: environmentsData, isLoading } = useEnvironments();
  const createEnvironment = useCreateEnvironment();
  const updateEnvironment = useUpdateEnvironment();
  const deleteEnvironment = useDeleteEnvironment();
  const setDefaultEnvironment = useSetDefaultEnvironment();
  const duplicateEnvironment = useDuplicateEnvironment();
  const exportEnvironment = useExportEnvironment();
  const importEnvironment = useImportEnvironment();

  const environments = environmentsData?.environments || [];

  const routingFromPairs = (headers: [string, string][], services: [string, string][]): RoutingPolicy => ({
    headers: Object.fromEntries(headers.filter(([k]) => k.trim())),
    services: Object.fromEntries(services.filter(([k]) => k.trim())),
  });

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormColor(PRESET_COLORS[0]);
    setFormVariables([]);
    setFormRoutingHeaders([]);
    setFormRoutingServices([]);
  };

  const openCreateDialog = () => {
    resetForm();
    setEditingEnv(null);
    setCreateDialogOpen(true);
  };

  const openEditDialog = (env: Environment) => {
    setFormName(env.name);
    setFormDescription(env.description);
    setFormColor(env.color || PRESET_COLORS[0]);
    setFormVariables(env.variables || []);
    setFormRoutingHeaders(Object.entries(env.routing?.headers || {}));
    setFormRoutingServices(Object.entries(env.routing?.services || {}));
    setEditingEnv(env);
    setCreateDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;

    const data = {
      name: formName,
      description: formDescription,
      color: formColor,
      variables: formVariables,
      routing: routingFromPairs(formRoutingHeaders, formRoutingServices),
    };

    if (editingEnv) {
      await updateEnvironment.mutateAsync({ id: editingEnv.id, data });
    } else {
      await createEnvironment.mutateAsync(data);
    }

    setCreateDialogOpen(false);
    resetForm();
    setEditingEnv(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this environment?')) {
      await deleteEnvironment.mutateAsync(id);
    }
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultEnvironment.mutateAsync(id);
  };

  const handleDuplicate = async () => {
    if (!duplicateId || !duplicateName.trim()) return;
    await duplicateEnvironment.mutateAsync({ id: duplicateId, name: duplicateName });
    setDuplicateDialogOpen(false);
    setDuplicateName('');
    setDuplicateId(null);
  };

  const handleExport = async (id: string, includeSecrets = false) => {
    const data = await exportEnvironment.mutateAsync({ id, includeSecrets });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.name.toLowerCase().replace(/\s+/g, '-')}-environment.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    try {
      const data = JSON.parse(importData);
      await importEnvironment.mutateAsync(data);
      setImportDialogOpen(false);
      setImportData('');
    } catch (e) {
      alert('Invalid JSON format');
    }
  };

  const addVariable = () => {
    setFormVariables([
      ...formVariables,
      { key: '', value: '', description: '', is_secret: false, enabled: true },
    ]);
  };

  const updateVariable = (index: number, field: keyof EnvironmentVariable, value: any) => {
    const updated = [...formVariables];
    updated[index] = { ...updated[index], [field]: value };
    setFormVariables(updated);
  };

  const removeVariable = (index: number) => {
    setFormVariables(formVariables.filter((_, i) => i !== index));
  };

  const toggleSecretVisibility = (envId: string) => {
    setShowSecrets((prev) => ({ ...prev, [envId]: !prev[envId] }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8]">Environments</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Manage environment variables for different deployment targets</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportDialogOpen(true)}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
          >
            <Upload className="w-3 h-3" />
            Import
          </button>
          <button
            onClick={openCreateDialog}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
            New Environment
          </button>
        </div>
      </div>

      {environments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Globe className="w-10 h-10 mb-3 text-[#1e2d3d]" />
          <p className="text-sm text-[#3d5670] mb-4">No environments yet</p>
          <button
            onClick={openCreateDialog}
            className="flex items-center gap-1.5 h-7 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Create First Environment
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {environments.map((env) => (
            <div key={env.id} className="relative bg-[#0f1923] border border-[#1e2d3d] rounded-xl overflow-hidden hover:border-[#2a3d52] transition-colors">
              {/* Color accent bar */}
              <div
                className="h-0.5 w-full"
                style={{ backgroundColor: env.color || PRESET_COLORS[6] }}
              />
              {/* Card header */}
              <div className="flex items-start justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-semibold text-[#c8dce8] truncate">{env.name}</span>
                  {env.is_default && (
                    <span className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-400 shrink-0">
                      <Star className="w-2.5 h-2.5 fill-current" />
                      Default
                    </span>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors shrink-0">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditDialog(env)}>Edit</DropdownMenuItem>
                    {!env.is_default && (
                      <DropdownMenuItem onClick={() => handleSetDefault(env.id)}>
                        <Star className="w-4 h-4 mr-2" />Set as Default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => { setDuplicateId(env.id); setDuplicateName(`${env.name} (Copy)`); setDuplicateDialogOpen(true); }}>
                      <Copy className="w-4 h-4 mr-2" />Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleExport(env.id, false)}>
                      <Download className="w-4 h-4 mr-2" />Export (masked)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport(env.id, true)}>
                      <Download className="w-4 h-4 mr-2" />Export (with secrets)
                    </DropdownMenuItem>
                    {!env.is_default && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(env.id)}>
                          <Trash2 className="w-4 h-4 mr-2" />Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {env.description && (
                <p className="px-4 pb-2 text-[11px] text-[#3d5670] line-clamp-1">{env.description}</p>
              )}

              {/* Meta row */}
              <div className="flex items-center justify-between px-4 pb-3">
                <div className="flex items-center gap-3 text-[11px] text-[#3d5670]">
                  <span className="flex items-center gap-1">
                    <Variable className="w-3 h-3" />
                    {env.variables?.length || 0} variables
                  </span>
                  {(Object.keys(env.routing?.headers || {}).length > 0 ||
                    Object.keys(env.routing?.services || {}).length > 0) && (
                    <span className="flex items-center gap-1">
                      <Route className="w-3 h-3" />
                      {Object.keys(env.routing?.headers || {}).length + Object.keys(env.routing?.services || {}).length} routing
                    </span>
                  )}
                </div>
                <button
                  className="flex items-center gap-1 text-[10px] text-[#4a6480] hover:text-teal-400 transition-colors"
                  onClick={() => toggleSecretVisibility(env.id)}
                >
                  {showSecrets[env.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showSecrets[env.id] ? 'Hide' : 'Show'}
                </button>
              </div>

              {/* Variables preview */}
              {env.variables && env.variables.length > 0 && (
                <div className="mx-4 mb-4 rounded-lg bg-[#0b0f18] border border-[#1a2332] p-2.5 font-mono text-[11px] space-y-1 max-h-28 overflow-y-auto">
                  {env.variables.slice(0, 5).map((v, i) => (
                    <div key={i} className={cn('flex items-center gap-2', !v.enabled && 'opacity-40')}>
                      <span className="text-teal-400/80 truncate max-w-[40%]">{v.key}</span>
                      <span className="text-[#2a3d52]">=</span>
                      <span className="truncate text-[#4a6480]">
                        {v.is_secret && !showSecrets[env.id] ? '••••••••' : v.value || '(empty)'}
                      </span>
                    </div>
                  ))}
                  {env.variables.length > 5 && (
                    <div className="text-[#3d5670]">+{env.variables.length - 5} more…</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEnv ? 'Edit Environment' : 'Create Environment'}
            </DialogTitle>
            <DialogDescription>
              {editingEnv
                ? 'Update environment settings and variables'
                : 'Create a new environment with variables'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Production"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      className={cn(
                        'w-6 h-6 rounded-full border-2 transition-transform',
                        formColor === color
                          ? 'border-foreground scale-110'
                          : 'border-transparent'
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormColor(color)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Variables</Label>
                <Button variant="outline" size="sm" onClick={addVariable}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Variable
                </Button>
              </div>

              {formVariables.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Enabled</TableHead>
                      <TableHead className="w-[40%]">Key</TableHead>
                      <TableHead className="w-[40%]">Value</TableHead>
                      <TableHead className="w-20">Secret</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formVariables.map((variable, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Switch
                            checked={variable.enabled}
                            onCheckedChange={(checked) =>
                              updateVariable(index, 'enabled', checked)
                            }
                          />
                        </TableCell>
                        <TableCell className="min-w-[200px]">
                          <Input
                            placeholder="KEY"
                            className="font-mono text-sm w-full"
                            value={variable.key}
                            onChange={(e) =>
                              updateVariable(index, 'key', e.target.value)
                            }
                          />
                        </TableCell>
                        <TableCell className="min-w-[300px]">
                          <Input
                            placeholder="value"
                            type={variable.is_secret ? 'password' : 'text'}
                            className="font-mono text-sm w-full"
                            value={variable.value}
                            onChange={(e) =>
                              updateVariable(index, 'value', e.target.value)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={variable.is_secret}
                            onCheckedChange={(checked) =>
                              updateVariable(index, 'is_secret', checked)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeVariable(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8 border rounded-md">
                  No variables yet. Click "Add Variable" to get started.
                </div>
              )}
            </div>

            {/* Routing Policy */}
            <div className="space-y-4 border rounded-md p-4">
              <div>
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Route className="w-4 h-4" />
                  Routing Policy
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Headers are injected into every HTTP request. Service URLs are accessible as{' '}
                  <code className="font-mono">{'${service.<name>}'}</code> in flows.
                </p>
              </div>

              {/* Routing Headers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    HTTP Headers
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFormRoutingHeaders([...formRoutingHeaders, ['', '']])}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Header
                  </Button>
                </div>
                {formRoutingHeaders.length > 0 ? (
                  <div className="space-y-2">
                    {formRoutingHeaders.map(([key, value], i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input
                          placeholder="X-Sandbox-ID"
                          className="font-mono text-sm"
                          value={key}
                          onChange={(e) => {
                            const updated = [...formRoutingHeaders];
                            updated[i] = [e.target.value, updated[i][1]];
                            setFormRoutingHeaders(updated);
                          }}
                        />
                        <Input
                          placeholder="value"
                          className="font-mono text-sm"
                          value={value}
                          onChange={(e) => {
                            const updated = [...formRoutingHeaders];
                            updated[i] = [updated[i][0], e.target.value];
                            setFormRoutingHeaders(updated);
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive"
                          onClick={() =>
                            setFormRoutingHeaders(formRoutingHeaders.filter((_, j) => j !== i))
                          }
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">
                    No routing headers. Add one to inject it into all HTTP steps.
                  </div>
                )}
              </div>

              {/* Service URLs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    <span className="flex items-center gap-1">
                      <Server className="w-3 h-3" />
                      Service URLs
                    </span>
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFormRoutingServices([...formRoutingServices, ['', '']])}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Service
                  </Button>
                </div>
                {formRoutingServices.length > 0 ? (
                  <div className="space-y-2">
                    {formRoutingServices.map(([name, url], i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input
                          placeholder="user-service"
                          className="font-mono text-sm"
                          value={name}
                          onChange={(e) => {
                            const updated = [...formRoutingServices];
                            updated[i] = [e.target.value, updated[i][1]];
                            setFormRoutingServices(updated);
                          }}
                        />
                        <Input
                          placeholder="http://sandbox.internal:5001"
                          className="font-mono text-sm"
                          value={url}
                          onChange={(e) => {
                            const updated = [...formRoutingServices];
                            updated[i] = [updated[i][0], e.target.value];
                            setFormRoutingServices(updated);
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive"
                          onClick={() =>
                            setFormRoutingServices(formRoutingServices.filter((_, j) => j !== i))
                          }
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">
                    No service URLs. Add one to override base URLs per environment.
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !formName.trim() ||
                createEnvironment.isPending ||
                updateEnvironment.isPending
              }
            >
              {(createEnvironment.isPending || updateEnvironment.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingEnv ? 'Save Changes' : 'Create Environment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Environment</DialogTitle>
            <DialogDescription>
              Create a copy of this environment with a new name
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="duplicate-name">New Name</Label>
            <Input
              id="duplicate-name"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="Enter new environment name"
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={!duplicateName.trim() || duplicateEnvironment.isPending}
            >
              {duplicateEnvironment.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Environment</DialogTitle>
            <DialogDescription>
              Paste the exported environment JSON to import
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder='{"name": "Production", "variables": [...]}'
              rows={10}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!importData.trim() || importEnvironment.isPending}
            >
              {importEnvironment.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
