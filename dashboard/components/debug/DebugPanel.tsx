'use client';

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Pause, Play, StepForward, Square, Trash2, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDebugSession, useDebugState, useDebugHistory, useBreakpoints,
  usePause, useResume, useStepOver, useStop,
  useRemoveBreakpoint, useToggleBreakpoint,
} from '@/lib/hooks/useDebug';

interface DebugPanelProps {
  executionId: string;
  onClose?: () => void;
}

function stateColor(state: string) {
  switch (state) {
    case 'running': return 'bg-blue-400/10 text-blue-400';
    case 'paused': return 'bg-yellow-400/10 text-yellow-400';
    case 'terminated': return 'bg-[#1a2332] text-[#4a6480]';
    default: return 'bg-[#1a2332] text-[#4a6480]';
  }
}

type DebugTab = 'variables' | 'history' | 'breakpoints';

export function DebugPanel({ executionId, onClose }: DebugPanelProps) {
  const [activeTab, setActiveTab] = useState<DebugTab>('variables');

  const { data: session } = useDebugSession(executionId);
  const { data: state } = useDebugState(executionId);
  const { data: history } = useDebugHistory(executionId);
  const { data: breakpoints } = useBreakpoints(executionId);

  const pause = usePause();
  const resume = useResume();
  const stepOver = useStepOver();
  const stop = useStop();
  const removeBreakpoint = useRemoveBreakpoint();
  const toggleBreakpoint = useToggleBreakpoint();

  const sessionState = session?.state ?? 'idle';
  const isPaused = sessionState === 'paused';
  const isRunning = sessionState === 'running' || sessionState === 'stepping';
  const isTerminated = sessionState === 'terminated';

  return (
    <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923] font-mono text-sm">
      <div className="px-4 py-3 border-b border-[#1a2332]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[#c8dce8]">Debug Session</span>
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', stateColor(sessionState))}>
              {sessionState}
            </span>
            {state?.current_step && (
              <span className="text-xs text-[#4a6480]">
                Step: <code className="bg-[#1a2332] px-1 rounded text-[#7fa8c8]">{state.current_step}</code>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isRunning && (
              <button
                onClick={() => pause.mutate(executionId)}
                disabled={pause.isPending}
                className="flex items-center justify-center h-7 w-7 rounded border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
              >
                <Pause className="h-3 w-3" />
              </button>
            )}
            {isPaused && (
              <>
                <button
                  onClick={() => resume.mutate(executionId)}
                  disabled={resume.isPending}
                  className="flex items-center justify-center h-7 w-7 rounded border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
                >
                  <Play className="h-3 w-3" />
                </button>
                <button
                  onClick={() => stepOver.mutate(executionId)}
                  disabled={stepOver.isPending}
                  className="flex items-center justify-center h-7 w-7 rounded border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
                >
                  <StepForward className="h-3 w-3" />
                </button>
              </>
            )}
            {!isTerminated && (
              <button
                onClick={() => stop.mutate(executionId)}
                disabled={stop.isPending}
                className="flex items-center justify-center h-7 w-7 rounded bg-red-400/10 text-red-400 hover:bg-red-400/20 disabled:opacity-50 transition-colors"
              >
                <Square className="h-3 w-3" />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors text-sm"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-0.5 mt-3">
          {(['variables', 'history', 'breakpoints'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-1.5 h-7 px-3 rounded text-xs capitalize transition-colors',
                activeTab === tab
                  ? 'bg-[#1a2332] text-[#c8dce8]'
                  : 'text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#131b26]'
              )}
            >
              {tab}
              {tab === 'breakpoints' && breakpoints && breakpoints.length > 0 && (
                <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                  {breakpoints.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3">
        {activeTab === 'variables' && (
          <ScrollArea className="h-48">
            {!state?.variables || Object.keys(state.variables).length === 0 ? (
              <p className="text-xs text-[#4a6480]">No variables in scope</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1a2332]">
                    <th className="text-left pb-1 font-medium text-[#4a6480]">Name</th>
                    <th className="text-left pb-1 font-medium text-[#4a6480]">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(state.variables).map(([k, v]) => (
                    <tr key={k} className="border-b border-[#1a2332] border-dashed">
                      <td className="py-1 pr-4 text-blue-400 font-mono">{k}</td>
                      <td className="py-1 text-green-400 truncate max-w-xs font-mono">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ScrollArea>
        )}

        {activeTab === 'history' && (
          <ScrollArea className="h-48">
            {!history || history.length === 0 ? (
              <p className="text-xs text-[#4a6480]">No steps executed yet</p>
            ) : (
              <div className="space-y-1">
                {history.map((snap) => (
                  <div key={snap.step_id} className="flex items-center gap-2 py-1 border-b border-dashed border-[#1a2332] text-xs">
                    <span className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                      snap.error ? 'bg-red-400/10 text-red-400' : 'bg-teal-400/10 text-teal-400'
                    )}>
                      {snap.error ? 'FAIL' : 'OK'}
                    </span>
                    <code className="text-blue-400">{snap.step_id}</code>
                    <span className="text-[#4a6480]">{snap.action}</span>
                    <span className="ml-auto text-[#4a6480]">{Math.round(snap.duration / 1_000_000)}ms</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}

        {activeTab === 'breakpoints' && (
          <ScrollArea className="h-48">
            {!breakpoints || breakpoints.length === 0 ? (
              <p className="text-xs text-[#4a6480]">No breakpoints set</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1a2332]">
                    <th className="text-left pb-1 font-medium text-[#4a6480]">Step</th>
                    <th className="text-left pb-1 font-medium text-[#4a6480]">Type</th>
                    <th className="text-left pb-1 font-medium text-[#4a6480]">Hits</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {breakpoints.map((bp) => (
                    <tr key={bp.id} className={cn('border-b border-[#1a2332]', !bp.enabled && 'opacity-50')}>
                      <td className="py-1 pr-2 font-mono text-[#7fa8c8]">{bp.step_id ?? '(all)'}</td>
                      <td className="py-1 pr-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#1e2d3d] text-[#7fa8c8]">
                          {bp.type}
                        </span>
                      </td>
                      <td className="py-1 pr-2 text-[#4a6480]">{bp.hit_count}</td>
                      <td className="py-1">
                        <div className="flex gap-1">
                          <button
                            onClick={() => toggleBreakpoint.mutate({ executionId, breakpointId: bp.id })}
                            title={bp.enabled ? 'Disable' : 'Enable'}
                            className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                          >
                            <ToggleRight className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => removeBreakpoint.mutate({ executionId, breakpointId: bp.id })}
                            className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
