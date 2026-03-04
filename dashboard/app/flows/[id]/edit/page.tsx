'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFlow, useUpdateFlow } from '@/lib/hooks/useFlows';
import { useCreateExecution } from '@/lib/hooks/useExecutions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { FlowEditor } from '@/components/flow-editor';
import type { FlowDefinition } from '@/lib/api/types';

export default function FlowEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: flow, isLoading, error } = useFlow(id);
  const updateFlow = useUpdateFlow();
  const createExecution = useCreateExecution();

  const handleSave = async (yaml: string, _definition: FlowDefinition) => {
    try {
      await updateFlow.mutateAsync({ id, data: { yaml } });
    } catch (err) {
      console.error('Failed to save flow:', err);
    }
  };

  const handleRun = async (definition: FlowDefinition) => {
    try {
      const execution = await createExecution.mutateAsync({
        flow_id: id,
        environment: 'development',
      });
      router.push(`/executions/${execution.id}`);
    } catch (err) {
      console.error('Failed to run flow:', err);
    }
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-destructive">
              Error loading flow: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !flow) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">Loading flow...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-background">
        <Link href={`/flows/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-semibold">{flow.name}</h1>
          {flow.description && (
            <p className="text-sm text-muted-foreground">{flow.description}</p>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <FlowEditor
          initialDefinition={flow.definition}
          onSave={handleSave}
          onRun={handleRun}
          isSaving={updateFlow.isPending}
          isRunning={createExecution.isPending}
        />
      </div>
    </div>
  );
}
