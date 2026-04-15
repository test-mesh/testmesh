'use client';

import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { TraceValidation } from '@/lib/api/types';

interface ValidationSummaryProps {
  validation: TraceValidation;
  onBadgeClick?: (type: 'violations' | 'slow') => void;
}

export function ValidationSummary({ validation, onBadgeClick }: ValidationSummaryProps) {
  const passedCount =
    (validation.path_match ? 1 : 0) +
    (validation.missing_nodes.length === 0 ? 1 : 0) +
    (validation.order_violations.length === 0 ? 1 : 0);
  const violationCount =
    validation.missing_nodes.length +
    validation.unexpected_nodes.length +
    validation.order_violations.length +
    validation.error_spans.length;
  const slowCount = validation.slow_spans.length;

  if (violationCount === 0 && slowCount === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-100/30 border border-green-200 text-sm text-green-700 mb-4">
        <CheckCircle2 className="w-4 h-4" />
        All assertions passed
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {passedCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-100/30 border border-green-200 text-xs text-green-700">
          <CheckCircle2 className="w-3 h-3" />
          {passedCount} passed
        </span>
      )}
      {violationCount > 0 && (
        <button
          onClick={() => onBadgeClick?.('violations')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-100/30 border border-red-200 text-xs text-red-700 hover:bg-red-100/50"
        >
          <XCircle className="w-3 h-3" />
          {violationCount} violations
        </button>
      )}
      {slowCount > 0 && (
        <button
          onClick={() => onBadgeClick?.('slow')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-100/30 border border-yellow-200 text-xs text-yellow-700 hover:bg-yellow-100/50"
        >
          <Clock className="w-3 h-3" />
          {slowCount} slow span{slowCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
