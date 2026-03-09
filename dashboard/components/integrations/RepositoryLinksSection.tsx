'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2, GitBranch, X, ChevronsUpDown, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIntegrations, useGitRepositories } from '@/lib/hooks/useIntegrations';
import {
  useRepositoryLinks,
  useCreateRepositoryLink,
  useUpdateRepositoryLink,
  useDeleteRepositoryLink,
} from '@/lib/hooks/useIntegrations';
import type { RepositoryLink, ServicePathMapping } from '@/lib/api/integrations';

interface RepositoryLinksSectionProps {
  workspaceId: string;
}

interface LinkFormState {
  integration_id: string;
  repository: string;
  default_branch: string;
  service_mappings: ServicePathMapping[];
  auto_adapt: boolean;
  auto_apply_threshold: number;
}

const defaultForm: LinkFormState = {
  integration_id: '',
  repository: '',
  default_branch: 'main',
  service_mappings: [],
  auto_adapt: false,
  auto_apply_threshold: 0,
};

export function RepositoryLinksSection({ workspaceId }: RepositoryLinksSectionProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<RepositoryLink | null>(null);
  const [form, setForm] = useState<LinkFormState>(defaultForm);
  const [newMappingService, setNewMappingService] = useState('');
  const [newMappingPatterns, setNewMappingPatterns] = useState('');

  const [repoComboboxOpen, setRepoComboboxOpen] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');

  const { data: linksData, isLoading } = useRepositoryLinks(workspaceId);
  const { data: integrationsData } = useIntegrations({ type: 'git' });
  const { data: reposData, isLoading: reposLoading, isError: reposError } = useGitRepositories(form.integration_id, repoSearch);
  const createLink = useCreateRepositoryLink();
  const updateLink = useUpdateRepositoryLink();
  const deleteLink = useDeleteRepositoryLink();

  const links = linksData?.repository_links || [];
  const gitIntegrations = integrationsData?.integrations || [];

  const openCreate = () => {
    setEditingLink(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (link: RepositoryLink) => {
    setEditingLink(link);
    setForm({
      integration_id: link.integration_id,
      repository: link.repository,
      default_branch: link.default_branch,
      service_mappings: link.service_mappings || [],
      auto_adapt: link.auto_adapt,
      auto_apply_threshold: link.auto_apply_threshold,
    });
    setDialogOpen(true);
  };

  const addMapping = () => {
    if (!newMappingService.trim()) return;
    const patterns = newMappingPatterns
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    if (patterns.length === 0) return;
    setForm(prev => ({
      ...prev,
      service_mappings: [
        ...prev.service_mappings,
        { service_name: newMappingService.trim(), path_patterns: patterns },
      ],
    }));
    setNewMappingService('');
    setNewMappingPatterns('');
  };

  const removeMapping = (index: number) => {
    setForm(prev => ({
      ...prev,
      service_mappings: prev.service_mappings.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    if (!form.integration_id || !form.repository) {
      toast({ title: 'Missing fields', description: 'Integration and repository are required', variant: 'destructive' });
      return;
    }

    try {
      if (editingLink) {
        await updateLink.mutateAsync({
          workspaceId,
          linkId: editingLink.id,
          data: {
            default_branch: form.default_branch,
            service_mappings: form.service_mappings,
            auto_adapt: form.auto_adapt,
            auto_apply_threshold: form.auto_apply_threshold,
          },
        });
        toast({ title: 'Repository link updated' });
      } else {
        await createLink.mutateAsync({
          workspaceId,
          data: {
            integration_id: form.integration_id,
            repository: form.repository,
            default_branch: form.default_branch,
            service_mappings: form.service_mappings,
            auto_adapt: form.auto_adapt,
            auto_apply_threshold: form.auto_apply_threshold,
          },
        });
        toast({ title: 'Repository link created' });
      }
      setDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save repository link',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (link: RepositoryLink) => {
    try {
      await deleteLink.mutateAsync({ workspaceId, linkId: link.id });
      toast({ title: 'Repository link deleted' });
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const isSaving = createLink.isPending || updateLink.isPending;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Link repositories to this workspace to enable AI-powered test adaptation when code changes.
            Tag flows with <code className="bg-muted px-1 rounded text-xs">service:your-service-name</code> to link them.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Repository
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : links.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <GitBranch className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No repositories linked yet</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Repository</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Services Mapped</TableHead>
              <TableHead>Auto-Adapt</TableHead>
              <TableHead>Auto-Apply Threshold</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map(link => (
              <TableRow key={link.id}>
                <TableCell className="font-mono text-sm">{link.repository}</TableCell>
                <TableCell>{link.default_branch}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(link.service_mappings || []).map(m => (
                      <Badge key={m.service_name} variant="outline" className="text-xs">
                        {m.service_name}
                      </Badge>
                    ))}
                    {(!link.service_mappings || link.service_mappings.length === 0) && (
                      <span className="text-muted-foreground text-xs">None</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {link.auto_adapt ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">Enabled</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Disabled</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {link.auto_apply_threshold > 0
                    ? `${Math.round(link.auto_apply_threshold * 100)}%`
                    : 'Manual'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(link)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(link)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLink ? 'Edit Repository Link' : 'Add Repository Link'}</DialogTitle>
            <DialogDescription>
              Link a repository to enable code-aware test adaptation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!editingLink && (
              <>
                <div className="space-y-2">
                  <Label>Git Integration</Label>
                  <Select value={form.integration_id} onValueChange={v => { setForm(p => ({ ...p, integration_id: v, repository: '' })); setRepoSearch(''); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select integration..." />
                    </SelectTrigger>
                    <SelectContent>
                      {gitIntegrations.map(i => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name} ({i.provider})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Repository</Label>
                  {!reposError && (reposData?.repositories?.length ?? 0) > 0 || reposLoading || form.integration_id ? (
                    <Popover open={repoComboboxOpen} onOpenChange={setRepoComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={repoComboboxOpen}
                          className="w-full justify-between font-normal"
                          disabled={!form.integration_id}
                        >
                          {form.repository || <span className="text-muted-foreground">Select repository...</span>}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search repositories..."
                            value={repoSearch}
                            onValueChange={setRepoSearch}
                          />
                          <CommandList>
                            {reposLoading ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            ) : reposError ? (
                              <CommandEmpty>Failed to load repositories. Check integration token.</CommandEmpty>
                            ) : (reposData?.repositories?.length ?? 0) === 0 ? (
                              <CommandEmpty>No repositories found.</CommandEmpty>
                            ) : (
                              <CommandGroup>
                                {reposData!.repositories.map(repo => (
                                  <CommandItem
                                    key={repo.full_name}
                                    value={repo.full_name}
                                    onSelect={() => {
                                      setForm(p => ({ ...p, repository: repo.full_name }));
                                      setRepoComboboxOpen(false);
                                    }}
                                  >
                                    <div className="flex items-center gap-2 w-full min-w-0">
                                      <span className="font-medium truncate">{repo.full_name}</span>
                                      {repo.private && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                                    </div>
                                    {repo.description && (
                                      <span className="text-xs text-muted-foreground truncate">{repo.description}</span>
                                    )}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <>
                      <Input
                        value={form.repository}
                        onChange={e => setForm(p => ({ ...p, repository: e.target.value }))}
                        placeholder="owner/repo"
                      />
                      {form.integration_id && (
                        <p className="text-xs text-muted-foreground">
                          Add an access token in the integration to browse repositories
                        </p>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Default Branch</Label>
              <Input
                value={form.default_branch}
                onChange={e => setForm(p => ({ ...p, default_branch: e.target.value }))}
                placeholder="main"
              />
            </div>

            <div className="space-y-2">
              <Label>Service Path Mappings</Label>
              <p className="text-xs text-muted-foreground">
                Map service names to file path patterns. Tag flows with <code className="bg-muted px-1 rounded">service:name</code> to link them.
              </p>
              <div className="space-y-2">
                {form.service_mappings.map((mapping, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 border rounded">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{mapping.service_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{mapping.path_patterns.join(', ')}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeMapping(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newMappingService}
                    onChange={e => setNewMappingService(e.target.value)}
                    placeholder="service-name"
                    className="w-40"
                  />
                  <Input
                    value={newMappingPatterns}
                    onChange={e => setNewMappingPatterns(e.target.value)}
                    placeholder="api/user-service/**, proto/user/**"
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={addMapping} type="button">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-Adapt</Label>
                <p className="text-xs text-muted-foreground">Automatically analyze code changes and generate test adaptation suggestions</p>
              </div>
              <Switch
                checked={form.auto_adapt}
                onCheckedChange={v => setForm(p => ({ ...p, auto_adapt: v }))}
              />
            </div>

            {form.auto_adapt && (
              <div className="space-y-2">
                <Label>Auto-Apply Threshold: {form.auto_apply_threshold > 0 ? `${Math.round(form.auto_apply_threshold * 100)}%` : 'Manual only'}</Label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.auto_apply_threshold}
                  onChange={e => setForm(p => ({ ...p, auto_apply_threshold: parseFloat(e.target.value) }))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  {form.auto_apply_threshold === 0
                    ? 'All suggestions will require manual review'
                    : `Suggestions with ≥${Math.round(form.auto_apply_threshold * 100)}% confidence will be automatically applied`}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
