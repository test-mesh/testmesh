'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

  const openCreate = () => { setEditingLink(null); setForm(defaultForm); setDialogOpen(true); };

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
    const patterns = newMappingPatterns.split(',').map(p => p.trim()).filter(Boolean);
    if (patterns.length === 0) return;
    setForm(prev => ({
      ...prev,
      service_mappings: [...prev.service_mappings, { service_name: newMappingService.trim(), path_patterns: patterns }],
    }));
    setNewMappingService('');
    setNewMappingPatterns('');
  };

  const removeMapping = (index: number) => {
    setForm(prev => ({ ...prev, service_mappings: prev.service_mappings.filter((_, i) => i !== index) }));
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
        <p className="text-xs text-[#4a6480]">
          Link repositories to this workspace to enable AI-powered test adaptation when code changes.
          Tag flows with <code className="px-1 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8] text-[11px]">service:your-service-name</code> to link them.
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors shrink-0 ml-4"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Repository
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[#4a6480]" />
        </div>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <GitBranch className="h-10 w-10 mb-2 text-[#3d5670]" />
          <p className="text-xs text-[#4a6480]">No repositories linked yet</p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#1e2d3d] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1a2332] bg-[#0f1923]">
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Repository</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Branch</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Services Mapped</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Auto-Adapt</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Auto-Apply</th>
                <th className="text-right py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2332]">
              {links.map(link => (
                <tr key={link.id} className="hover:bg-[#131b26] transition-colors">
                  <td className="py-3 px-3 font-mono text-[#c8dce8]">{link.repository}</td>
                  <td className="py-3 px-3 text-[#7fa8c8]">{link.default_branch}</td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1">
                      {(link.service_mappings || []).map(m => (
                        <span key={m.service_name} className="text-[10px] px-1.5 py-0.5 rounded border border-[#2a3d52] text-[#7fa8c8]">
                          {m.service_name}
                        </span>
                      ))}
                      {(!link.service_mappings || link.service_mappings.length === 0) && (
                        <span className="text-[#4a6480]">None</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {link.auto_adapt ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-400">Enabled</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2332] text-[#4a6480]">Disabled</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-[#7fa8c8]">
                    {link.auto_apply_threshold > 0
                      ? `${Math.round(link.auto_apply_threshold * 100)}%`
                      : 'Manual'}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(link)}
                        className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(link)}
                        className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                  <Select
                    value={form.integration_id}
                    onValueChange={v => { setForm(p => ({ ...p, integration_id: v, repository: '' })); setRepoSearch(''); }}
                  >
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
                        <button
                          role="combobox"
                          aria-expanded={repoComboboxOpen}
                          disabled={!form.integration_id}
                          className="flex items-center justify-between w-full h-9 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#c8dce8] hover:border-[#2a3d52] disabled:opacity-50 transition-colors"
                        >
                          {form.repository || <span className="text-[#4a6480]">Select repository...</span>}
                          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-[#4a6480]" />
                        </button>
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
                                <Loader2 className="h-4 w-4 animate-spin text-[#4a6480]" />
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
                                      {repo.private && <Lock className="h-3 w-3 shrink-0 text-[#4a6480]" />}
                                    </div>
                                    {repo.description && (
                                      <span className="text-xs text-[#4a6480] truncate">{repo.description}</span>
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
                        <p className="text-xs text-[#4a6480]">
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
              <p className="text-xs text-[#4a6480]">
                Map service names to file path patterns. Tag flows with <code className="px-1 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8] text-[11px]">service:name</code> to link them.
              </p>
              <div className="space-y-2">
                {form.service_mappings.map((mapping, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded border border-[#1e2d3d] bg-[#0b0f18]">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#c8dce8]">{mapping.service_name}</p>
                      <p className="text-[10px] text-[#4a6480] truncate">{mapping.path_patterns.join(', ')}</p>
                    </div>
                    <button
                      onClick={() => removeMapping(i)}
                      className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
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
                  <button
                    onClick={addMapping}
                    type="button"
                    className="flex items-center justify-center h-9 w-9 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-Adapt</Label>
                <p className="text-xs text-[#4a6480]">Automatically analyze code changes and generate test adaptation suggestions</p>
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
                <p className="text-xs text-[#4a6480]">
                  {form.auto_apply_threshold === 0
                    ? 'All suggestions will require manual review'
                    : `Suggestions with ≥${Math.round(form.auto_apply_threshold * 100)}% confidence will be automatically applied`}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              onClick={() => setDialogOpen(false)}
              className="flex items-center gap-2 h-9 px-4 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
            >
              {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</> : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
