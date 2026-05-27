'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SuggestionCard } from '@/components/ai/SuggestionCard';
import { useFlows } from '@/lib/hooks/useFlows';
import {
  useSuggestions,
  useAcceptSuggestion,
  useRejectSuggestion,
  useApplySuggestion,
} from '@/lib/hooks/useAI';
import { ArrowLeft, Lightbulb, Search, Loader2 } from 'lucide-react';
import type { SuggestionStatus, SuggestionType } from '@/lib/api/types';

export default function SuggestionsPage() {
  const searchParams = useSearchParams();
  const [selectedFlowId, setSelectedFlowId] = useState(searchParams.get('flow_id') ?? '');
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<SuggestionType | ''>('');

  const { data: flowsData, isLoading: flowsLoading } = useFlows({});
  const { data: suggestionsData, isLoading: suggestionsLoading, refetch } = useSuggestions(selectedFlowId, statusFilter || undefined);

  const acceptSuggestion = useAcceptSuggestion();
  const rejectSuggestion = useRejectSuggestion();
  const applySuggestion = useApplySuggestion();

  const flows = flowsData?.flows || [];
  const allSuggestions = suggestionsData?.suggestions || [];
  const suggestions = typeFilter ? allSuggestions.filter(s => s.type === typeFilter) : allSuggestions;

  const handleAccept = async (id: string) => { await acceptSuggestion.mutateAsync(id); refetch(); };
  const handleReject = async (id: string) => { await rejectSuggestion.mutateAsync(id); refetch(); };
  const handleApply  = async (id: string) => { await applySuggestion.mutateAsync(id);  refetch(); };

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Link
          href="/executions"
          className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Lightbulb className="h-4 w-4 text-[#3d5670]" />
        <h1 className="text-xl font-semibold text-[#c8dce8]">AI Suggestions</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Review and apply AI-generated suggestions for your test flows</p>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Select Flow</Label>
            <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
              <SelectTrigger><SelectValue placeholder="Choose a flow..." /></SelectTrigger>
              <SelectContent>
                {flowsLoading ? (
                  <SelectItem value="__loading__" disabled>Loading flows...</SelectItem>
                ) : flows.length === 0 ? (
                  <SelectItem value="__empty__" disabled>No flows found</SelectItem>
                ) : (
                  flows.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id}>{flow.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v as SuggestionStatus)}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v as SuggestionType)}>
              <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="fix">Fix</SelectItem>
                <SelectItem value="optimization">Optimization</SelectItem>
                <SelectItem value="assertion">Assertion</SelectItem>
                <SelectItem value="code_sync">Code Sync</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => refetch()}
              disabled={!selectedFlowId || suggestionsLoading}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-50 transition-colors"
            >
              {suggestionsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Suggestions List */}
      {!selectedFlowId ? (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
          <Lightbulb className="h-10 w-10 mb-3 text-[#1e2d3d]" />
          <p className="text-[13px] font-semibold text-[#c8dce8] mb-1">Select a Flow</p>
          <p className="text-xs text-[#4a6480]">Choose a flow to view its AI-generated suggestions</p>
        </div>
      ) : suggestionsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#3d5670]" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
          <Lightbulb className="h-10 w-10 mb-3 text-[#1e2d3d]" />
          <p className="text-[13px] font-semibold text-[#c8dce8] mb-1">No Suggestions</p>
          <p className="text-xs text-[#4a6480]">
            No AI suggestions found for this flow
            {statusFilter && ` with status "${statusFilter}"`}
          </p>
          <p className="text-[11px] text-[#3d5670] mt-3">Run a failed execution and analyze it to generate suggestions</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[#4a6480]">{suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} found</p>
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={() => handleAccept(suggestion.id)}
              onReject={() => handleReject(suggestion.id)}
              onApply={() => handleApply(suggestion.id)}
              isApplying={applySuggestion.isPending}
            />
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332]">
          <span className="text-[11px] font-semibold text-[#c8dce8]">How AI Suggestions Work</span>
        </div>
        <div className="p-4 grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-semibold text-[#c8dce8] mb-2">Failure Fix Suggestions</p>
            <ol className="space-y-1.5 text-[11px] text-[#4a6480] list-decimal list-inside">
              <li>When a test execution fails, trigger AI analysis from the execution details page</li>
              <li>The AI examines error messages, outputs, and flow structure</li>
              <li>It generates suggestions with fixes, optimizations, or improvements</li>
              <li>Review each suggestion, accept or reject it, then apply accepted suggestions</li>
            </ol>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#c8dce8] mb-2">Code Sync Suggestions</p>
            <ol className="space-y-1.5 text-[11px] text-[#4a6480] list-decimal list-inside">
              <li>When code is pushed to a linked repository, TestMesh fetches the diff</li>
              <li>Flows tagged with <code className="bg-[#1a2d3d] px-1 rounded text-[10px] text-teal-400/80">service:name</code> matching path mappings are analyzed</li>
              <li>The AI determines if the test needs updating to match the new API contract</li>
              <li>High-confidence suggestions can be auto-applied based on your threshold setting</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
