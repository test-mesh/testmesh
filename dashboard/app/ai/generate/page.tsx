'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PromptInput } from '@/components/ai/PromptInput';
import { GeneratedFlowPreview } from '@/components/ai/GeneratedFlowPreview';
import { useAIProviders, useGenerateFlow } from '@/lib/hooks/useAI';
import { useCreateFlow } from '@/lib/hooks/useFlows';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { GenerateFlowResponse, AIProviderType } from '@/lib/api/types';

export default function GeneratePage() {
  const router = useRouter();
  const [result, setResult] = useState<GenerateFlowResponse | null>(null);

  const { data: providersData } = useAIProviders();
  const generateFlow = useGenerateFlow();
  const createFlow = useCreateFlow();

  const providers = providersData?.providers || [];

  const handleGenerate = async (
    prompt: string,
    options: { provider?: AIProviderType }
  ) => {
    try {
      const response = await generateFlow.mutateAsync({
        prompt,
        provider: options.provider,
      });
      setResult(response);
    } catch (error) {
      console.error('Generation failed:', error);
    }
  };

  const handleSaveFlow = async () => {
    if (!result?.yaml) return;

    try {
      const flow = await createFlow.mutateAsync({ yaml: result.yaml });
      router.push(`/flows/${flow.id}`);
    } catch (error) {
      console.error('Failed to save flow:', error);
    }
  };

  const handleReset = () => {
    setResult(null);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/ai">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8" />
            Generate Flow
          </h1>
          <p className="text-muted-foreground mt-1">
            Describe your test in natural language and let AI create the flow
          </p>
        </div>
      </div>

      {!result ? (
        <Card>
          <CardHeader>
            <CardTitle>What would you like to test?</CardTitle>
          </CardHeader>
          <CardContent>
            <PromptInput
              onSubmit={handleGenerate}
              isLoading={generateFlow.isPending}
              providers={providers}
              placeholder="Describe the test scenario you want to create. Be specific about the API endpoints, expected behaviors, and assertions..."
            />

            {generateFlow.isError && (
              <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-lg">
                <p className="font-medium">Generation failed</p>
                <p className="text-sm mt-1">
                  {generateFlow.error instanceof Error
                    ? generateFlow.error.message
                    : 'An unknown error occurred'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Button variant="outline" onClick={handleReset}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Another
          </Button>

          <GeneratedFlowPreview
            yaml={result.yaml}
            flowDef={result.flow}
            tokensUsed={result.tokens_used}
            latencyMs={result.latency_ms}
            provider={result.provider}
            model={result.model}
            onSave={handleSaveFlow}
            isSaving={createFlow.isPending}
          />

          {createFlow.isError && (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg">
              <p className="font-medium">Failed to save flow</p>
              <p className="text-sm mt-1">
                {createFlow.error instanceof Error
                  ? createFlow.error.message
                  : 'An unknown error occurred'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
