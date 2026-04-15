'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';

interface DriftCalloutProps {
  driftDetails: string;
}

export function DriftCallout({ driftDetails }: DriftCalloutProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-yellow-50/30 border border-yellow-200 text-sm text-yellow-800 mb-4">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-600" />
      <div className="flex-1">
        <span className="font-semibold">Drift detected — </span>
        {driftDetails}{' '}
        <Link href="/analytics" className="underline underline-offset-2 hover:text-yellow-900">
          View drift details →
        </Link>
      </div>
      <button onClick={() => setDismissed(true)} className="text-yellow-600 hover:text-yellow-800">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
