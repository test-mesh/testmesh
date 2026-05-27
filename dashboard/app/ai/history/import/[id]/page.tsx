'use client';

import { use } from 'react';
import Link from 'next/link';
import { useImportHistoryDetail } from '@/lib/hooks/useAI';
import {
  ArrowLeft, FileUp, RefreshCw, FileCode, ExternalLink, CheckCircle, AlertCircle,
} from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  completed:  'bg-teal-400/10 text-teal-400 border-teal-400/30',
  processing: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  pending:    'bg-[#1a2d3d] text-[#4a7a96] border-[#2a3d52]',
  failed:     'bg-red-400/10 text-red-400 border-red-400/30',
};

const SOURCE_STYLES: Record<string, string> = {
  openapi: 'bg-teal-400/10 text-teal-400 border-teal-400/30',
  postman: 'bg-orange-400/10 text-orange-400 border-orange-400/30',
  pact:    'bg-purple-400/10 text-purple-400 border-purple-400/30',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ImportDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: importData, isLoading, error } = useImportHistoryDetail(id);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

  if (isLoading) {
    return (
      <div className="px-6 py-6 flex items-center justify-center py-24">
        <RefreshCw className="h-6 w-6 animate-spin text-[#3d5670]" />
      </div>
    );
  }

  if (error || !importData) {
    return (
      <div className="px-6 py-6 space-y-5">
        <Link href="/ai/history" className="inline-flex items-center gap-1.5 text-xs text-[#4a6480] hover:text-[#7fa8c8] transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to History
        </Link>
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
          <FileUp className="h-10 w-10 mb-3 text-[#1e2d3d]" />
          <p className="text-xs text-[#4a6480]">Import record not found</p>
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
          <FileUp className="h-4 w-4 text-[#3d5670]" />
          <h1 className="text-xl font-semibold text-[#c8dce8]">Import Details</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Imported on {formatDate(importData.created_at)}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${STATUS_STYLES[importData.status] ?? STATUS_STYLES.pending}`}>
          {importData.status}
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-3">
          <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <FileCode className="h-3 w-3" />Source
          </p>
          <p className="text-sm font-semibold text-[#c8dce8]">{importData.source_name}</p>
          <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${SOURCE_STYLES[importData.source_type] ?? 'bg-[#1a2d3d] text-[#4a7a96] border-[#2a3d52]'}`}>
            {importData.source_type}
          </span>
        </div>
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-3">
          <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1.5">Flows Generated</p>
          <p className="text-2xl font-bold text-teal-400">{importData.flows_generated}</p>
        </div>
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-3">
          <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1.5">Status</p>
          <div className="flex items-center gap-2">
            {importData.status === 'completed' ? (
              <CheckCircle className="h-4 w-4 text-teal-400" />
            ) : importData.status === 'failed' ? (
              <AlertCircle className="h-4 w-4 text-red-400" />
            ) : (
              <RefreshCw className="h-4 w-4 text-yellow-400 animate-spin" />
            )}
            <span className="text-xs font-medium text-[#c8dce8] capitalize">{importData.status}</span>
          </div>
        </div>
      </div>

      {/* Generated Flows */}
      {importData.flow_ids && importData.flow_ids.length > 0 && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Generated Flows</span>
            <span className="text-[10px] text-[#4a6480] ml-2">{importData.flows_generated} flow{importData.flows_generated !== 1 ? 's' : ''} created from this import</span>
          </div>
          <div className="divide-y divide-[#1a2332]">
            {importData.flow_ids.map((flowId: string) => (
              <div key={flowId} className="flex items-center justify-between px-4 py-2.5 hover:bg-[#131b26] transition-colors">
                <span className="text-xs font-mono text-[#7fa8c8]">{flowId}</span>
                <Link href={`/flows/${flowId}`} className="flex items-center gap-1.5 text-[10px] text-[#4a6480] hover:text-teal-400 transition-colors">
                  View Flow <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
        <p className="text-[11px] font-semibold text-[#c8dce8] mb-3">Actions</p>
        <Link
          href="/import?tab=spec"
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
        >
          <FileUp className="h-3 w-3" />
          Import Another Spec
        </Link>
      </div>

      {/* Error */}
      {importData.error && (
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-4">
          <p className="text-[11px] font-semibold text-red-400 mb-1">Error</p>
          <p className="text-xs text-red-400/80">{importData.error}</p>
        </div>
      )}
    </div>
  );
}
