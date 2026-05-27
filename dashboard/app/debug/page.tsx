'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bug, ChevronDown, ChevronRight } from 'lucide-react';
import { useDebugSessions } from '@/lib/hooks/useDebug';
import { DebugPanel } from '@/components/debug/DebugPanel';

const STATE_STYLES: Record<string, string> = {
  paused:   'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  running:  'bg-teal-400/10 text-teal-400 border-teal-400/30',
  stepping: 'bg-teal-400/10 text-teal-400 border-teal-400/30',
};

export default function DebugPage() {
  const { data, isLoading } = useDebugSessions();
  const sessions = data ?? [];
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(searchParams.get('session'));

  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (sessionParam && sessions.some((s) => s.execution_id === sessionParam)) {
      setExpanded(sessionParam);
    }
  }, [sessions, searchParams]);

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Bug className="h-4 w-4 text-[#3d5670]" />
        <h1 className="text-xl font-semibold text-[#c8dce8]">Debug Sessions</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Active flow execution debug sessions</p>
      </div>

      {isLoading ? (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex items-center justify-center py-12">
          <p className="text-xs text-[#4a6480]">Loading sessions…</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
          <Bug className="h-10 w-10 mb-3 text-[#1e2d3d]" />
          <p className="text-[13px] font-semibold text-[#c8dce8] mb-1">No active debug sessions</p>
          <p className="text-xs text-[#4a6480]">Start a flow execution with the CLI debug flag</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div key={session.id} className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <button
                className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-[#131b26] transition-colors text-left"
                onClick={() => setExpanded(expanded === session.execution_id ? null : session.execution_id)}
              >
                {expanded === session.execution_id
                  ? <ChevronDown className="h-3.5 w-3.5 text-[#4a6480] shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 text-[#4a6480] shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-semibold text-[#c8dce8] truncate">{session.execution_id}</p>
                  <p className="text-[10px] text-[#4a6480]">
                    Flow: <code className="text-[#7fa8c8]">{session.flow_id}</code> · {session.step_count} steps
                  </p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${STATE_STYLES[session.state] ?? 'bg-[#1a2d3d] text-[#4a7a96] border-[#2a3d52]'}`}>
                  {session.state}
                </span>
              </button>
              {expanded === session.execution_id && (
                <div className="border-t border-[#1a2332]">
                  <DebugPanel executionId={session.execution_id} onClose={() => setExpanded(null)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
