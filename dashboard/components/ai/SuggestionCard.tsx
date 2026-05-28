'use client';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Check,
  X,
  ChevronDown,
  Lightbulb,
  Wrench,
  Zap,
  Timer,
  AlertCircle,
  GitCommit,
} from 'lucide-react';
import type { Suggestion, SuggestionType } from '@/lib/api/types';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onAccept?: () => void;
  onReject?: () => void;
  onApply?: () => void;
  isApplying?: boolean;
}

const TYPE_ICONS: Record<SuggestionType, React.ReactNode> = {
  fix: <Wrench className="h-4 w-4" />,
  optimization: <Zap className="h-4 w-4" />,
  retry_strategy: <Timer className="h-4 w-4" />,
  assertion: <AlertCircle className="h-4 w-4" />,
  timeout: <Timer className="h-4 w-4" />,
  code_sync: <GitCommit className="h-4 w-4" />,
};

const TYPE_LABELS: Record<SuggestionType, string> = {
  fix: 'Fix',
  optimization: 'Optimization',
  retry_strategy: 'Retry Strategy',
  assertion: 'Assertion',
  timeout: 'Timeout',
  code_sync: 'Code Sync',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-400/10 text-yellow-400',
  accepted: 'bg-blue-400/10 text-blue-400',
  rejected: 'bg-[#1a2d3d] text-[#4a6480]',
  applied: 'bg-teal-400/10 text-teal-400',
};

export function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  onApply,
  isApplying = false,
}: SuggestionCardProps) {
  const confidencePercent = Math.round(suggestion.confidence * 100);
  const confidenceColor =
    confidencePercent >= 80
      ? 'text-teal-400'
      : confidencePercent >= 50
      ? 'text-yellow-400'
      : 'text-red-400';

  return (
    <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
      <div className="px-4 py-3 border-b border-[#1a2332]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-[#7fa8c8]">
            {TYPE_ICONS[suggestion.type]}
            <span className="text-sm font-medium text-[#c8dce8]">{suggestion.title}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-[#1e2d3d] text-[#7fa8c8]">
              {TYPE_LABELS[suggestion.type]}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_COLORS[suggestion.status] || 'bg-[#1a2332] text-[#4a6480]'}`}>
              {suggestion.status}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <Lightbulb className="h-3.5 w-3.5 text-[#4a6480]" />
          <span className="text-[#4a6480]">Confidence:</span>
          <span className={`font-medium ${confidenceColor}`}>{confidencePercent}%</span>
        </div>

        {suggestion.type === 'code_sync' && suggestion.commit_sha && (
          <div className="flex items-center gap-2 text-xs text-[#4a6480]">
            <GitCommit className="h-3.5 w-3.5" />
            <span>Triggered by commit:</span>
            <code className="bg-[#1a2332] px-1 rounded font-mono text-[#7fa8c8]">
              {suggestion.commit_sha.slice(0, 8)}
            </code>
          </div>
        )}

        {suggestion.type === 'code_sync' && suggestion.changed_files && suggestion.changed_files.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-[#7fa8c8] hover:text-[#c8dce8] transition-colors">
              <ChevronDown className="h-3.5 w-3.5" />
              Changed files ({suggestion.changed_files.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <ul className="text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1a2332] p-3 rounded-lg space-y-0.5 font-mono">
                {suggestion.changed_files.map(f => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}

        {suggestion.description && (
          <p className="text-xs text-[#7fa8c8]">{suggestion.description}</p>
        )}

        {suggestion.reasoning && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-[#7fa8c8] hover:text-[#c8dce8] transition-colors">
              <ChevronDown className="h-3.5 w-3.5" />
              Why this suggestion?
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <p className="text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1a2332] p-3 rounded-lg">
                {suggestion.reasoning}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}

        {suggestion.suggested_yaml && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-[#7fa8c8] hover:text-[#c8dce8] transition-colors">
              <ChevronDown className="h-3.5 w-3.5" />
              View suggested changes
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <pre className="bg-[#0b0f18] border border-[#1a2332] p-3 rounded-lg text-xs overflow-x-auto max-h-64 text-[#c8dce8] font-mono">
                <code>{suggestion.suggested_yaml}</code>
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}

        {suggestion.diff_patch && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-[#7fa8c8] hover:text-[#c8dce8] transition-colors">
              <ChevronDown className="h-3.5 w-3.5" />
              View diff
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <pre className="bg-[#0b0f18] border border-[#1a2332] p-3 rounded-lg text-xs overflow-x-auto max-h-64 whitespace-pre-wrap text-[#c8dce8] font-mono">
                <code dangerouslySetInnerHTML={{ __html: suggestion.diff_patch }} />
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}

        {suggestion.status === 'pending' && (
          <div className="flex items-center gap-2 pt-1">
            {onAccept && (
              <button
                onClick={onAccept}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-teal-400/30 hover:text-teal-400 transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
                Accept
              </button>
            )}
            {onReject && (
              <button
                onClick={onReject}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </button>
            )}
          </div>
        )}

        {suggestion.status === 'accepted' && onApply && (
          <button
            onClick={onApply}
            disabled={isApplying}
            className="flex items-center h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {isApplying ? 'Applying...' : 'Apply Suggestion'}
          </button>
        )}

        {suggestion.status === 'applied' && suggestion.applied_at && (
          <p className="text-xs text-[#4a6480]">
            Applied on {new Date(suggestion.applied_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
