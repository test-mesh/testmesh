'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateFlow } from '@/lib/hooks/useFlows';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { FlowEditor } from '@/components/flow-editor';
import { flowDefinitionToYaml } from '@/components/flow-editor/utils';
import type { FlowDefinition } from '@/lib/api/types';

const DEFAULT_DEFINITION: FlowDefinition = {
  name: 'New Flow',
  description: '',
  suite: '',
  tags: [],
  steps: [],
};

export default function NewFlowPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const createFlow = useCreateFlow();

  const handleSave = async (yaml: string, definition: FlowDefinition) => {
    setError(null);

    if (!definition.name || definition.name === 'Untitled Flow') {
      setError('Please provide a name for your flow');
      return;
    }

    if (!definition.steps || definition.steps.length === 0) {
      setError('Please add at least one step to your flow');
      return;
    }

    try {
      const flow = await createFlow.mutateAsync({ yaml });
      router.push(`/flows/${flow.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flow');
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-background">
        <Link href="/flows">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Flows
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-semibold">Create New Flow</h1>
          <p className="text-sm text-muted-foreground">
            Use the visual editor or YAML to define your test flow
          </p>
        </div>
        {error && (
          <div className="text-sm text-destructive">{error}</div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <FlowEditor
          initialDefinition={DEFAULT_DEFINITION}
          initialYaml={flowDefinitionToYaml(DEFAULT_DEFINITION)}
          onSave={handleSave}
          isSaving={createFlow.isPending}
        />
      </div>
    </div>
  );
}
