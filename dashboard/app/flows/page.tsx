'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFlows, useDeleteFlow } from '@/lib/hooks/useFlows';
import { useCreateExecution } from '@/lib/hooks/useExecutions';
import { useRunFlowForDebug } from '@/lib/hooks/useDebug';
import {
  Play,
  Trash2,
  Plus,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Upload,
  Sparkles,
  Zap,
  Bug,
  Layers,
} from 'lucide-react';

const PAGE_SIZE = 12;

function FlowCard({
  flow,
  onRun,
  onDebug,
  onDelete,
  isRunning,
  isDebugging,
  isDeleting,
}: {
  flow: any;
  onRun: (id: string) => void;
  onDebug: (id: string) => void;
  onDelete: (id: string) => void;
  isRunning: boolean;
  isDebugging: boolean;
  isDeleting: boolean;
}) {
  const stepCount = flow.definition.steps?.length ?? 0;

  return (
    <div className="group relative flex flex-col bg-[#0f1923] border border-[#1e2d3d] rounded-xl hover:border-[#2a3d52] transition-colors overflow-hidden">
      {/* Top section */}
      <Link href={`/flows/${flow.id}`} className="flex-1 p-4 block">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="text-[13px] font-semibold text-[#c8dce8] leading-snug line-clamp-2 group-hover:text-teal-400 transition-colors">
            {flow.name}
          </span>
          <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] shrink-0">
            {flow.environment || 'default'}
          </span>
        </div>

        {flow.description && (
          <p className="text-[11px] text-[#3d5670] line-clamp-2 mb-3">{flow.description}</p>
        )}

        {/* Tags */}
        {(flow.suite || flow.tags?.length > 0) && (
          <div className="flex flex-wrap gap-1 mb-3">
            {flow.suite && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-400/70">
                {flow.suite}
              </span>
            )}
            {flow.tags?.map((tag: string) => (
              <span key={tag} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-[#3d5670]">
          <Layers className="w-3 h-3" />
          <span>{stepCount} step{stepCount !== 1 ? 's' : ''}</span>
        </div>
      </Link>

      {/* Action bar */}
      <div className="flex items-center gap-1 px-3 py-2.5 border-t border-[#1a2332]">
        <button
          className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-medium bg-teal-400/10 text-teal-400 hover:bg-teal-400/20 transition-colors disabled:opacity-50"
          onClick={() => onRun(flow.id)}
          disabled={isRunning}
        >
          <Play className="w-3 h-3" />
          Run
        </button>
        <button
          className="flex items-center justify-center h-7 w-7 rounded-lg text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors disabled:opacity-50"
          onClick={() => onDebug(flow.id)}
          disabled={isDebugging}
          title="Debug"
        >
          <Bug className="w-3.5 h-3.5" />
        </button>
        <button
          className="flex items-center justify-center h-7 w-7 rounded-lg text-[#4a6480] hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
          onClick={() => onDelete(flow.id)}
          disabled={isDeleting}
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function FlowsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [suiteFilter, setSuiteFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useFlows({
    suite: suiteFilter || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const deleteFlow = useDeleteFlow();
  const createExecution = useCreateExecution();
  const runFlowForDebug = useRunFlowForDebug();
  const router = useRouter();

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this flow?')) {
      deleteFlow.mutate(id);
    }
  };

  const handleRun = (flowId: string) => {
    createExecution.mutate({ flow_id: flowId, environment: 'development' });
  };

  const handleDebug = (flowId: string) => {
    runFlowForDebug.mutate(flowId, {
      onSuccess: (session) => router.push(`/debug?session=${session.execution_id}`),
    });
  };

  const resetPage = () => setPage(0);

  const flows = data?.flows || [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filteredFlows = flows.filter((flow) => {
    const matchesSearch =
      flow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flow.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSuite = !suiteFilter || flow.suite?.toLowerCase().includes(suiteFilter.toLowerCase());
    const matchesTag = !tagFilter || flow.tags?.some((tag: string) =>
      tag.toLowerCase().includes(tagFilter.toLowerCase())
    );
    return matchesSearch && matchesSuite && matchesTag;
  });

  const hasActiveFilters = searchQuery || suiteFilter || tagFilter;
  const clearFilters = () => { setSearchQuery(''); setSuiteFilter(''); setTagFilter(''); resetPage(); };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Flows</CardTitle>
            <CardDescription>{error instanceof Error ? error.message : 'An error occurred'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8]">Test Flows</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Manage and execute your test flows</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/runner"
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
          >
            <Zap className="w-3 h-3" />
            Run with Data
          </Link>
          <Link
            href="/import"
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
          >
            <Upload className="w-3 h-3" />
            Import
          </Link>
          <Link
            href="/ai/generate"
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Generate
          </Link>
          <Link
            href="/flows/new"
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Create Flow
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#3d5670]" />
          <input
            placeholder="Search flows..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); resetPage(); }}
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
          />
        </div>
        <input
          placeholder="Suite..."
          value={suiteFilter}
          onChange={(e) => { setSuiteFilter(e.target.value); resetPage(); }}
          className="w-36 h-8 px-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
        />
        <input
          placeholder="Tag..."
          value={tagFilter}
          onChange={(e) => { setTagFilter(e.target.value); resetPage(); }}
          className="w-36 h-8 px-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
        />
        {hasActiveFilters && (
          <button
            className="flex items-center justify-center h-8 w-8 rounded-lg text-[#4a6480] hover:text-[#c8dce8] hover:bg-[#1a2d3d] transition-colors"
            onClick={clearFilters}
            title="Clear filters"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex gap-2 items-center mb-4 text-xs text-[#3d5670]">
          <span>Filters:</span>
          {searchQuery && (
            <button
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1a2d3d] text-[#7fa8c8] hover:text-[#c8dce8] transition-colors"
              onClick={() => { setSearchQuery(''); resetPage(); }}
            >
              {searchQuery} <X className="w-2.5 h-2.5" />
            </button>
          )}
          {suiteFilter && (
            <button
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1a2d3d] text-[#7fa8c8] hover:text-[#c8dce8] transition-colors"
              onClick={() => { setSuiteFilter(''); resetPage(); }}
            >
              Suite: {suiteFilter} <X className="w-2.5 h-2.5" />
            </button>
          )}
          {tagFilter && (
            <button
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1a2d3d] text-[#7fa8c8] hover:text-[#c8dce8] transition-colors"
              onClick={() => { setTagFilter(''); resetPage(); }}
            >
              Tag: {tagFilter} <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-[#0f1923] border border-[#1e2d3d] animate-pulse" />
          ))}
        </div>
      ) : filteredFlows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Layers className="w-10 h-10 mb-3 text-[#1e2d3d]" />
          <p className="text-sm text-[#3d5670] mb-4">
            {flows.length === 0 ? 'No flows yet' : 'No flows match your filters'}
          </p>
          <Link
            href="/flows/new"
            className="flex items-center gap-1.5 h-7 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Create Your First Flow
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredFlows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              onRun={handleRun}
              onDebug={handleDebug}
              onDelete={handleDelete}
              isRunning={createExecution.isPending}
              isDebugging={runFlowForDebug.isPending}
              isDeleting={deleteFlow.isPending}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-5 flex items-center justify-between text-xs text-[#3d5670]">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} flows
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1 h-7 px-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-40 transition-colors text-xs"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <span className="text-[#4a6480]">Page {page + 1} of {totalPages}</span>
              <button
                className="flex items-center gap-1 h-7 px-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-40 transition-colors text-xs"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
