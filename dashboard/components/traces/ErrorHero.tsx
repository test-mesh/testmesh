'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Span } from '@/lib/api/types';

interface ErrorHeroProps {
  span: Span;
}

export function ErrorHero({ span }: ErrorHeroProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-l-4 border-red-500 bg-red-50/20 rounded-r-lg p-4 mb-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">
            Error — {span.service}
          </p>
          <p className="font-mono text-sm font-semibold">{span.operation}</p>
          {span.status_message && (
            <p className="text-sm text-red-700 mt-1 font-mono">{span.status_message}</p>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground ml-4 shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 rounded-md border divide-y text-sm">
          {Object.entries(span.attributes).map(([k, v]) => (
            <div key={k} className="flex px-3 py-1.5 gap-3">
              <span className="text-muted-foreground font-mono">{k}</span>
              <span className="ml-auto font-mono">{String(v)}</span>
            </div>
          ))}
          {span.events.map((event, i) => (
            <div key={i} className="px-3 py-1.5">
              <span className="font-semibold">{event.name}</span>
              <span className="text-muted-foreground ml-2 text-xs font-mono">
                {event.timestamp}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
