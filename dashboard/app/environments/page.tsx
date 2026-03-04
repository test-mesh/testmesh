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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import type { Environment, EnvironmentVariable } from '@/lib/api/environments';

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

  const { data: environmentsData, isLoading } = useEnvironments();
  const createEnvironment = useCreateEnvironment();
  const updateEnvironment = useUpdateEnvironment();
  const deleteEnvironment = useDeleteEnvironment();
  const setDefaultEnvironment = useSetDefaultEnvironment();
  const duplicateEnvironment = useDuplicateEnvironment();
  const exportEnvironment = useExportEnvironment();
  const importEnvironment = useImportEnvironment();

  const environments = environmentsData?.environments || [];

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormColor(PRESET_COLORS[0]);
    setFormVariables([]);
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
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Globe className="w-8 h-8" />
            Environments
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage environment variables for different deployment targets
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            New Environment
          </Button>
        </div>
      </div>

      {environments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No environments yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create environments to manage variables for different deployment targets
              (Development, Staging, Production)
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Environment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {environments.map((env) => (
            <Card key={env.id} className="relative">
              <div
                className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
                style={{ backgroundColor: env.color || PRESET_COLORS[6] }}
              />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{env.name}</CardTitle>
                    {env.is_default && (
                      <Badge variant="secondary" className="text-xs">
                        <Star className="w-3 h-3 mr-1 fill-current" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(env)}>
                        Edit
                      </DropdownMenuItem>
                      {!env.is_default && (
                        <DropdownMenuItem onClick={() => handleSetDefault(env.id)}>
                          <Star className="w-4 h-4 mr-2" />
                          Set as Default
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          setDuplicateId(env.id);
                          setDuplicateName(`${env.name} (Copy)`);
                          setDuplicateDialogOpen(true);
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleExport(env.id, false)}>
                        <Download className="w-4 h-4 mr-2" />
                        Export (masked)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport(env.id, true)}>
                        <Download className="w-4 h-4 mr-2" />
                        Export (with secrets)
                      </DropdownMenuItem>
                      {!env.is_default && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(env.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {env.description && (
                  <CardDescription className="mt-1">{env.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <Variable className="w-4 h-4" />
                    {env.variables?.length || 0} variables
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => toggleSecretVisibility(env.id)}
                  >
                    {showSecrets[env.id] ? (
                      <EyeOff className="w-3 h-3 mr-1" />
                    ) : (
                      <Eye className="w-3 h-3 mr-1" />
                    )}
                    {showSecrets[env.id] ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {env.variables && env.variables.length > 0 ? (
                  <div className="space-y-1 text-sm font-mono bg-muted/50 rounded-md p-2 max-h-32 overflow-y-auto">
                    {env.variables.slice(0, 5).map((v, i) => (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center gap-2',
                          !v.enabled && 'opacity-50'
                        )}
                      >
                        <span className="text-blue-600 dark:text-blue-400 truncate">
                          {v.key}
                        </span>
                        <span className="text-muted-foreground">=</span>
                        <span className="truncate text-muted-foreground">
                          {v.is_secret && !showSecrets[env.id]
                            ? '••••••••'
                            : v.value || '(empty)'}
                        </span>
                      </div>
                    ))}
                    {env.variables.length > 5 && (
                      <div className="text-muted-foreground">
                        +{env.variables.length - 5} more...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    No variables defined
                  </div>
                )}
              </CardContent>
            </Card>
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
