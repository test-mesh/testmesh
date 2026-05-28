'use client';

import { useState } from 'react';
import { Check, Copy, FileText, Code, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowDefinition, AIProviderType } from '@/lib/api/types';

interface GeneratedFlowPreviewProps {
  yaml: string;
  flowDef?: FlowDefinition;
  tokensUsed?: number;
  latencyMs?: number;
  provider?: AIProviderType;
  model?: string;
  onSave?: () => void;
  onEdit?: () => void;
  isSaving?: boolean;
}

type PreviewTab = 'yaml' | 'steps';

export function GeneratedFlowPreview({
  yaml,
  flowDef,
  tokensUsed,
  latencyMs,
  provider,
  model,
  onSave,
  onEdit,
  isSaving = false,
}: GeneratedFlowPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<PreviewTab>('yaml');

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2332]">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#7fa8c8]" />
          <span className="text-sm font-medium text-[#c8dce8]">
            {flowDef?.name || 'Generated Flow'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {provider && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-[#1e2d3d] bg-[#1a2332] text-[#7fa8c8] capitalize">
              {provider}
            </span>
          )}
          {model && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#1a2332] text-[#4a6480]">
              {model}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-4 text-xs text-[#4a6480]">
          {tokensUsed && (
            <span className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" />
              {tokensUsed} tokens
            </span>
          )}
          {latencyMs && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {(latencyMs / 1000).toFixed(2)}s
            </span>
          )}
          {flowDef?.steps && (
            <span>{flowDef.steps.length} steps</span>
          )}
        </div>

        {flowDef?.description && (
          <p className="text-xs text-[#7fa8c8]">{flowDef.description}</p>
        )}

        {flowDef?.tags && flowDef.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {flowDef.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded border border-[#1e2d3d] text-[#4a6480]">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-1 border-b border-[#1a2332] pb-0">
          {([['yaml', 'YAML', Code], ['steps', 'Steps', FileText]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                tab === id
                  ? 'border-teal-400 text-teal-400'
                  : 'border-transparent text-[#4a6480] hover:text-[#7fa8c8]'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'yaml' && (
          <div className="relative">
            <pre className="bg-[#0b0f18] border border-[#1a2332] p-3 rounded-lg overflow-x-auto text-xs max-h-96 text-[#c8dce8] font-mono">
              <code>{yaml}</code>
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 flex items-center justify-center h-6 w-6 rounded hover:bg-[#1a2d3d] text-[#4a6480] hover:text-[#7fa8c8] transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-teal-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        {tab === 'steps' && (
          flowDef?.steps && flowDef.steps.length > 0 ? (
            <div className="space-y-2">
              {flowDef.steps.map((step, idx) => (
                <div
                  key={step.id || idx}
                  className="flex items-center gap-3 p-3 bg-[#0b0f18] border border-[#1a2332] rounded-lg"
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-400/15 text-teal-400 text-[10px] font-medium shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[#c8dce8]">{step.name || step.id}</div>
                    <div className="text-[10px] text-[#4a6480] mt-0.5">
                      <code className="bg-[#1a2332] px-1 rounded font-mono">{step.action}</code>
                      {step.description && ` - ${step.description}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#4a6480] text-center py-4">
              No steps found in the flow definition
            </p>
          )
        )}

        <div className="flex items-center gap-2 pt-2">
          {onSave && (
            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Flow'}
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex items-center h-8 px-4 rounded-lg text-xs border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
            >
              Edit YAML
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          >
            {copied ? 'Copied!' : 'Copy YAML'}
          </button>
        </div>
      </div>
    </div>
  );
}
