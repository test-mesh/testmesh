'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateRepo, useUpdateRepo } from '@/lib/hooks/useGraph';
import type { GraphRepo } from '@/lib/api/graph';

interface RepoDialogProps {
  open: boolean;
  onClose: () => void;
  repo?: GraphRepo; // undefined = create mode
}

export function RepoDialog({ open, onClose, repo }: RepoDialogProps) {
  const isEdit = !!repo;

  const [name, setName] = useState(repo?.name ?? '');
  const [url, setUrl] = useState(repo?.url ?? '');
  const [branch, setBranch] = useState(repo?.branch ?? 'main');
  const [pat, setPat] = useState('');
  const [sshKey, setSshKey] = useState('');
  const [error, setError] = useState('');

  const createMutation = useCreateRepo();
  const updateMutation = useUpdateRepo();

  const isPending = createMutation.isPending || updateMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!isEdit && !name.trim()) { setError('Name is required'); return; }
    if (!isEdit && !url.trim()) { setError('URL is required'); return; }

    try {
      if (isEdit && repo) {
        await updateMutation.mutateAsync({
          id: repo.id,
          req: {
            name: name || undefined,
            url: url || undefined,
            branch: branch || undefined,
            pat: pat || undefined,
            ssh_key: sshKey || undefined,
          },
        });
      } else {
        await createMutation.mutateAsync({ name, url, branch, pat: pat || undefined, ssh_key: sshKey || undefined });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Repository' : 'Register Repository'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repo-name">Name</Label>
            <Input
              id="repo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-service"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repo-url">Git URL</Label>
            <Input
              id="repo-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/org/repo.git"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repo-branch">Branch</Label>
            <Input
              id="repo-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repo-pat">Personal Access Token <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="repo-pat"
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder={isEdit ? '••••••• (leave blank to keep existing)' : 'ghp_…'}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repo-ssh">SSH Private Key <span className="text-muted-foreground">(optional)</span></Label>
            <textarea
              id="repo-ssh"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              value={sshKey}
              onChange={(e) => setSshKey(e.target.value)}
              placeholder={isEdit ? 'Leave blank to keep existing' : '-----BEGIN RSA PRIVATE KEY-----'}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Register'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
