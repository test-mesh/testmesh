'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useGenerationHistory,
  useImportHistory,
  useCoverageAnalyses,
} from '@/lib/hooks/useAI';
import {
  ArrowLeft,
  Sparkles,
  FileUp,
  Target,
  RefreshCw,
  History,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GenerationHistory, ImportHistory, CoverageAnalysis } from '@/lib/api/types';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed:  'bg-teal-400/10 text-teal-400',
    processing: 'bg-blue-400/10 text-blue-400',
    analyzing:  'bg-blue-400/10 text-blue-400',
    pending:    'bg-[#1a2d3d] text-[#4a6480]',
    failed:     'bg-red-400/10 text-red-400',
  };
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded capitalize w-fit', map[status] ?? 'bg-[#1a2d3d] text-[#4a6480]')}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] capitalize w-fit">
      {type}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString();
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export default function AIHistoryPage() {
  const [activeTab, setActiveTab] = useState('generations');

  const { data: generationsData, isLoading: generationsLoading } = useGenerationHistory({ limit: 50 });
  const { data: importsData, isLoading: importsLoading } = useImportHistory({ limit: 50 });
  const { data: coverageData, isLoading: coverageLoading } = useCoverageAnalyses({ limit: 50 });

  const generations = generationsData?.history || [];
  const imports = importsData?.history || [];
  const coverageAnalyses = coverageData?.analyses || [];

  const TABS = [
    { value: 'generations', label: 'Generations', icon: <Sparkles className="h-3 w-3" /> },
    { value: 'imports',     label: 'Imports',     icon: <FileUp className="h-3 w-3" /> },
    { value: 'coverage',    label: 'Coverage',    icon: <Target className="h-3 w-3" /> },
  ];

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Link
          href="/integrations"
          className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <History className="h-4 w-4 text-[#3d5670]" />
        <h1 className="text-xl font-semibold text-[#c8dce8]">AI History</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Browse history of AI-powered generations, imports, and analyses</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { tab: 'generations', icon: <Sparkles className="h-3.5 w-3.5 text-purple-400" />, label: 'Generations', count: generations.length, sub: 'AI-generated flows' },
          { tab: 'imports',     icon: <FileUp className="h-3.5 w-3.5 text-teal-400" />,     label: 'Imports',     count: imports.length,     sub: 'Spec imports (OpenAPI, Postman, Pact)' },
          { tab: 'coverage',    icon: <Target className="h-3.5 w-3.5 text-emerald-400" />,  label: 'Coverage',    count: coverageAnalyses.length, sub: 'Coverage reports' },
        ].map((card) => (
          <button
            key={card.tab}
            onClick={() => setActiveTab(card.tab)}
            className={cn(
              'flex flex-col gap-2 p-4 rounded-xl border text-left transition-colors',
              activeTab === card.tab
                ? 'bg-[#0f1923] border-teal-400/30'
                : 'bg-[#0f1923] border-[#1e2d3d] hover:border-[#2a3d52]'
            )}
          >
            <div className="flex items-center gap-1.5">
              {card.icon}
              <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{card.label}</span>
            </div>
            <p className="text-2xl font-bold leading-none text-[#c8dce8] tabular-nums">{card.count}</p>
            <p className="text-[10px] text-[#4a6480]">{card.sub}</p>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs transition-colors',
              activeTab === tab.value
                ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                : 'text-[#4a6480] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
            )}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Generations */}
      {activeTab === 'generations' && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Generation History</span>
            <span className="text-[10px] text-[#4a6480] ml-2">AI-generated flows from natural language prompts</span>
          </div>
          {generationsLoading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" /></div>
          ) : generations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="h-8 w-8 mb-2 text-[#1e2d3d]" />
              <p className="text-xs text-[#3d5670] mb-3">No generation history yet</p>
              <Link href="/ai/generate" className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors">
                Generate a Flow
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
                {['Date', 'Prompt', 'Provider', 'Status', 'Tokens', 'Latency', ''].map((h) => (
                  <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
                ))}
              </div>
              <div className="divide-y divide-[#1a2332]">
                {generations.map((gen: GenerationHistory) => (
                  <div key={gen.id} className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors">
                    <span className="text-[10px] text-[#4a6480]">{formatDate(gen.created_at)}</span>
                    <span className="text-[11px] text-[#c8dce8] line-clamp-2" title={gen.prompt}>{truncateText(gen.prompt, 100)}</span>
                    <TypeBadge type={gen.provider} />
                    <StatusBadge status={gen.status} />
                    <span className="text-[11px] text-[#7fa8c8]">{gen.tokens_used.toLocaleString()}</span>
                    <span className="text-[11px] text-[#4a6480]">{(gen.latency_ms / 1000).toFixed(2)}s</span>
                    <Link href={`/ai/history/generation/${gen.id}`} className="text-[11px] text-teal-400/70 hover:text-teal-400 transition-colors">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Imports */}
      {activeTab === 'imports' && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Import History</span>
            <span className="text-[10px] text-[#4a6480] ml-2">flows generated from OpenAPI, Postman, and Pact imports</span>
          </div>
          {importsLoading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" /></div>
          ) : imports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileUp className="h-8 w-8 mb-2 text-[#1e2d3d]" />
              <p className="text-xs text-[#3d5670] mb-3">No import history yet</p>
              <Link href="/import?tab=spec" className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors">
                Import a Spec
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
                {['Date', 'Source', 'Type', 'Status', 'Flows Generated', ''].map((h) => (
                  <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
                ))}
              </div>
              <div className="divide-y divide-[#1a2332]">
                {imports.map((imp: ImportHistory) => (
                  <div key={imp.id} className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors">
                    <span className="text-[10px] text-[#4a6480]">{formatDate(imp.created_at)}</span>
                    <span className="text-[12px] font-medium text-[#c8dce8]">{imp.source_name}</span>
                    <TypeBadge type={imp.source_type} />
                    <StatusBadge status={imp.status} />
                    <span className="text-[12px] font-medium text-[#c8dce8]">{imp.flows_generated}</span>
                    <Link href={`/ai/history/import/${imp.id}`} className="text-teal-400/70 hover:text-teal-400 transition-colors">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Coverage */}
      {activeTab === 'coverage' && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Coverage Analysis History</span>
            <span className="text-[10px] text-[#4a6480] ml-2">API coverage analyses comparing flows against specifications</span>
          </div>
          {coverageLoading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" /></div>
          ) : coverageAnalyses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Target className="h-8 w-8 mb-2 text-[#1e2d3d]" />
              <p className="text-xs text-[#3d5670] mb-3">No coverage analyses yet</p>
              <Link href="/ai/coverage" className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors">
                Analyze Coverage
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
                {['Date', 'Spec Name', 'Type', 'Status', 'Coverage', 'Endpoints', ''].map((h) => (
                  <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
                ))}
              </div>
              <div className="divide-y divide-[#1a2332]">
                {coverageAnalyses.map((analysis: CoverageAnalysis) => (
                  <div key={analysis.id} className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors">
                    <span className="text-[10px] text-[#4a6480]">{formatDate(analysis.created_at)}</span>
                    <span className="text-[12px] font-medium text-[#c8dce8]">{analysis.spec_name}</span>
                    <TypeBadge type={analysis.spec_type} />
                    <StatusBadge status={analysis.status} />
                    <span className={cn('text-[12px] font-semibold',
                      analysis.coverage_percent >= 80 ? 'text-teal-400' :
                      analysis.coverage_percent >= 50 ? 'text-yellow-400' : 'text-red-400'
                    )}>
                      {analysis.coverage_percent.toFixed(1)}%
                    </span>
                    <span className="text-[11px]">
                      <span className="text-teal-400">{analysis.covered_endpoints}</span>
                      <span className="text-[#3d5670]"> / </span>
                      <span className="text-[#7fa8c8]">{analysis.total_endpoints}</span>
                    </span>
                    <Link href={`/ai/history/coverage/${analysis.id}`} className="text-teal-400/70 hover:text-teal-400 transition-colors">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
