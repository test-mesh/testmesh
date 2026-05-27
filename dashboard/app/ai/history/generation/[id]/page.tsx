'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useGenerationHistoryDetail, useGenerateFlow } from '@/lib/hooks/useAI';
import {
  ArrowLeft, Sparkles, RefreshCw, Clock, Zap, FileText, Copy, Check, ExternalLink, RotateCcw,
} from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  completed:  'bg-teal-400/10 text-teal-400 border-teal-400/30',
  processing: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  pending:    'bg-[#1a2d3d] text-[#4a7a96] border-[#2a3d52]',
  failed:     'bg-red-400/10 text-red-400 border-red-400/30',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function GenerationDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: generation, isLoading, error } = useGenerationHistoryDetail(id);
  const regenerate = useGenerateFlow();
  const [copied, setCopied] = useState(false);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

  const handleCopyYaml = () => {
    if (generation?.generated_yaml) {
      navigator.clipboard.writeText(generation.generated_yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerate = () => {
    if (generation) {
      regenerate.mutate({ prompt: generation.prompt, provider: generation.provider, model: generation.model });
    }
  };

  if (isLoading) {
    return (
      <div className="px-6 py-6 flex items-center justify-center py-24">
        <RefreshCw className="h-6 w-6 animate-spin text-[#3d5670]" />
      </div>
    );
  }

  if (error || !generation) {
    return (
      <div className="px-6 py-6 space-y-5">
        <Link href="/ai/history" className="inline-flex items-center gap-1.5 text-xs text-[#4a6480] hover:text-[#7fa8c8] transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to History
        </Link>
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="h-10 w-10 mb-3 text-[#1e2d3d]" />
          <p className="text-xs text-[#4a6480]">Generation not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/ai/history" className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Sparkles className="h-4 w-4 text-[#3d5670]" />
          <h1 className="text-xl font-semibold text-[#c8dce8]">Generation Details</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Generated on {formatDate(generation.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${STATUS_STYLES[generation.status] ?? STATUS_STYLES.pending}`}>
            {generation.status}
          </span>
          <button
            onClick={handleRegenerate}
            disabled={regenerate.isPending}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
          >
            {regenerate.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            Regenerate
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-3">
          <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1.5">Provider</p>
          <p className="text-sm font-semibold text-[#c8dce8] capitalize">{generation.provider}</p>
          <p className="text-[10px] text-[#4a6480] mt-0.5">{generation.model}</p>
        </div>
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-3">
          <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1.5 flex items-center gap-1"><Zap className="h-3 w-3" />Tokens Used</p>
          <p className="text-2xl font-bold text-[#c8dce8]">{generation.tokens_used.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-3">
          <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1.5 flex items-center gap-1"><Clock className="h-3 w-3" />Latency</p>
          <p className="text-2xl font-bold text-[#c8dce8]">{(generation.latency_ms / 1000).toFixed(2)}s</p>
        </div>
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-3">
          <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1.5">Flow Created</p>
          {generation.flow_id ? (
            <Link href={`/flows/${generation.flow_id}`} className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors">
              View Flow <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            <span className="text-xs text-[#4a6480]">Not saved</span>
          )}
        </div>
      </div>

      {/* Prompt */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-[#4a6480]" />
          <span className="text-[11px] font-semibold text-[#c8dce8]">Prompt</span>
          <span className="text-[10px] text-[#4a6480]">Natural language description used to generate this flow</span>
        </div>
        <div className="p-4">
          <p className="text-xs text-[#c8dce8] whitespace-pre-wrap">{generation.prompt}</p>
        </div>
      </div>

      {/* Generated YAML */}
      {generation.generated_yaml && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-[#4a6480]" />
              <span className="text-[11px] font-semibold text-[#c8dce8]">Generated YAML</span>
              <span className="text-[10px] text-[#4a6480]">Flow definition generated by AI</span>
            </div>
            <button
              onClick={handleCopyYaml}
              className="flex items-center gap-1.5 h-6 px-2.5 rounded text-[10px] font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
            >
              {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy YAML</>}
            </button>
          </div>
          <div className="p-4 overflow-x-auto">
            <pre className="text-xs font-mono text-[#7fa8c8]"><code>{generation.generated_yaml}</code></pre>
          </div>
        </div>
      )}

      {/* Error */}
      {generation.error && (
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-4">
          <p className="text-[11px] font-semibold text-red-400 mb-1">Error</p>
          <p className="text-xs text-red-400/80">{generation.error}</p>
        </div>
      )}
    </div>
  );
}
