'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { useApplyRepairSuggestion, useDismissRepairSuggestion } from '@/lib/hooks/useTelemetry';
import type { RepairSuggestion } from '@/lib/api/types';

interface Props {
  workspaceId: string;
  suggestion: RepairSuggestion;
}

export function RepairSuggestionCard({ workspaceId, suggestion }: Props) {
  const [showDiff, setShowDiff] = useState(false);
  const apply = useApplyRepairSuggestion();
  const dismiss = useDismissRepairSuggestion();

  if (suggestion.status !== 'pending') return null;

  const confidencePct = Math.round(suggestion.confidence * 100);

  return (
    <div className="rounded-xl bg-blue-400/5 border border-blue-400/20 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
        <span className="font-semibold text-sm text-[#c8dce8]">Repair Suggestion</span>
        <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8]">
          {confidencePct}% confidence
        </span>
      </div>

      <p className="text-xs text-[#4a6480] mb-3 leading-relaxed">
        {suggestion.diagnosis}
      </p>

      {suggestion.yaml_diff && (
        <div className="mb-3">
          <button
            onClick={() => setShowDiff(!showDiff)}
            className="flex items-center gap-1 text-xs text-[#4a6480] hover:text-[#7fa8c8] transition-colors"
          >
            {showDiff ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showDiff ? 'Hide diff' : 'View diff'}
          </button>
          {showDiff && (
            <pre className="mt-2 p-3 bg-[#0b0f18] border border-[#1e2d3d] rounded-lg text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap text-[#7fa8c8]">
              {suggestion.yaml_diff}
            </pre>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => apply.mutate({ workspaceId, suggestionId: suggestion.id })}
          disabled={apply.isPending || apply.isSuccess || dismiss.isPending}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
        >
          <Check className="w-3 h-3" />
          Apply fix
        </button>
        <button
          onClick={() => dismiss.mutate({ workspaceId, suggestionId: suggestion.id })}
          disabled={dismiss.isPending || apply.isPending || apply.isSuccess}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] disabled:opacity-50 transition-colors"
        >
          <X className="w-3 h-3" />
          Dismiss
        </button>
      </div>
    </div>
  );
}
