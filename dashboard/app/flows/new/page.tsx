'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateFlow } from '@/lib/hooks/useFlows';
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
      <div className="flex items-center gap-4 px-4 py-3 border-b border-[#1e2d3d] bg-[#0b0f18]">
        <Link
          href="/flows"
          className="flex items-center gap-1.5 h-7 px-2 rounded text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Flows
        </Link>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-[#c8dce8]">Create New Flow</h1>
          <p className="text-xs text-[#3d5670]">
            Use the visual editor or YAML to define your test flow
          </p>
        </div>
        {error && (
          <div className="text-xs text-red-400">{error}</div>
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
