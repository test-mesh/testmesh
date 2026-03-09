'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, GitBranch } from 'lucide-react';
import { RepositoryLinksSection } from '@/components/integrations/RepositoryLinksSection';

interface WorkspaceSettingsPageProps {
  params: Promise<{ workspace_id: string }>;
}

export default function WorkspaceSettingsPage({ params }: WorkspaceSettingsPageProps) {
  const { workspace_id } = use(params);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workspaces">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Workspace Settings</h1>
          <p className="text-muted-foreground">Configure repository links and code-aware test adaptation</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            <div>
              <CardTitle>Repository Links</CardTitle>
              <CardDescription>
                Link git repositories to this workspace and configure AI-powered test adaptation.
                When code changes, TestMesh can automatically analyze the diff and generate flow
                update suggestions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RepositoryLinksSection workspaceId={workspace_id} />
        </CardContent>
      </Card>
    </div>
  );
}
