'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FlakinessTable } from '@/components/analytics/FlakinessTable';
import { useFlakiness } from '@/lib/hooks/useReports';
import { ArrowLeft, Search, AlertTriangle, HelpCircle, Loader2 } from 'lucide-react';
import type { GetFlakinessResponse, FlakinessMetric } from '@/lib/api/types';

export default function FlakinessPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading, error } = useFlakiness({ limit, offset: page * limit });

  const flakyFlows = (data as GetFlakinessResponse)?.flaky_flows || [];
  const total = (data as GetFlakinessResponse)?.total || 0;

  const filteredFlows = searchQuery
    ? flakyFlows.filter((f: FlakinessMetric) =>
        f.flow?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.flow_id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : flakyFlows;

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/analytics" className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <AlertTriangle className="h-4 w-4 text-[#3d5670]" />
        <h1 className="text-xl font-semibold text-[#c8dce8]">Flaky Tests</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Tests with inconsistent pass/fail patterns</p>
      </div>

      {/* Info */}
      <div className="rounded-xl bg-yellow-400/5 border border-yellow-400/20 p-4 flex items-start gap-3">
        <HelpCircle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] font-semibold text-yellow-400 mb-1">What is a flaky test?</p>
          <p className="text-[11px] text-yellow-400/80">
            A flaky test produces inconsistent results without code changes. The flakiness score is based on how often
            the result changes and how close the pass rate is to 50%. Higher scores indicate more unreliable tests.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#3d5670]" />
          <input
            placeholder="Search by flow name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-7 pl-7 pr-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
          />
        </div>
        <span className="text-xs text-[#4a6480]">{total} flaky tests detected</span>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
          <span className="text-[11px] font-semibold text-[#c8dce8]">Flaky Test Results</span>
          <span className="text-[10px] text-[#4a6480] ml-1">Tests ordered by flakiness score (highest first)</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[#3d5670]" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-[11px] text-red-400">Failed to load flakiness data</div>
        ) : (
          <>
            <FlakinessTable data={filteredFlows} />
            {total > limit && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#1a2332]">
                <p className="text-xs text-[#4a6480]">
                  Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
                </p>
                <div className="flex gap-1.5">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-40 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    disabled={(page + 1) * limit >= total}
                    onClick={() => setPage(p => p + 1)}
                    className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Tips */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332]">
          <span className="text-[11px] font-semibold text-[#c8dce8]">Tips for Fixing Flaky Tests</span>
        </div>
        <ol className="px-4 py-3 space-y-2">
          {[
            'Check for race conditions or timing issues in async operations',
            'Ensure proper test isolation — each test should be independent',
            'Avoid relying on external services without proper mocking',
            'Use explicit waits instead of fixed sleep times',
            'Consider using retry mechanisms for network operations',
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px] text-[#4a6480]">
              <span className="font-semibold text-[#7fa8c8] shrink-0">{i + 1}.</span>
              {tip}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
