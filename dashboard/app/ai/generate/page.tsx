'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

  const handleGenerate = async (prompt: string, options: { provider?: AIProviderType }) => {
    try {
      const response = await generateFlow.mutateAsync({ prompt, provider: options.provider });
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

  const handleReset = () => setResult(null);

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Link
          href="/flows"
          className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Sparkles className="h-4 w-4 text-[#3d5670]" />
        <h1 className="text-xl font-semibold text-[#c8dce8]">Generate Flow</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Describe your test in natural language and let AI create the flow</p>
      </div>

      {!result ? (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">What would you like to test?</span>
          </div>
          <div className="p-4">
            <PromptInput
              onSubmit={handleGenerate}
              isLoading={generateFlow.isPending}
              providers={providers}
              placeholder="Describe the test scenario you want to create. Be specific about the API endpoints, expected behaviors, and assertions..."
            />

            {generateFlow.isError && (
              <div className="mt-4 p-3 rounded-lg bg-red-400/10 border border-red-400/20">
                <p className="text-xs font-semibold text-red-400">Generation failed</p>
                <p className="text-[11px] text-red-400/80 mt-0.5">
                  {generateFlow.error instanceof Error ? generateFlow.error.message : 'An unknown error occurred'}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors"
          >
            <Sparkles className="h-3 w-3" />Generate Another
          </button>

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
            <div className="p-3 rounded-lg bg-red-400/10 border border-red-400/20">
              <p className="text-xs font-semibold text-red-400">Failed to save flow</p>
              <p className="text-[11px] text-red-400/80 mt-0.5">
                {createFlow.error instanceof Error ? createFlow.error.message : 'An unknown error occurred'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
