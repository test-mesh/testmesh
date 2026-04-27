'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Pause, Play, StepForward, Square, Trash2, ToggleRight } from 'lucide-react';
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
    case 'running': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'paused': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    case 'terminated': return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function DebugPanel({ executionId, onClose }: DebugPanelProps) {
  const [activeTab, setActiveTab] = useState<'variables' | 'history' | 'breakpoints'>('variables');

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
    <Card className="font-mono text-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base font-mono">Debug Session</CardTitle>
            <Badge className={stateColor(sessionState)}>{sessionState}</Badge>
            {state?.current_step && (
              <span className="text-xs text-muted-foreground">
                Step: <code className="bg-muted px-1 rounded">{state.current_step}</code>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isRunning && (
              <Button size="sm" variant="outline" onClick={() => pause.mutate(executionId)} disabled={pause.isPending}>
                <Pause className="h-3 w-3" />
              </Button>
            )}
            {isPaused && (
              <>
                <Button size="sm" variant="outline" onClick={() => resume.mutate(executionId)} disabled={resume.isPending}>
                  <Play className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => stepOver.mutate(executionId)} disabled={stepOver.isPending}>
                  <StepForward className="h-3 w-3" />
                </Button>
              </>
            )}
            {!isTerminated && (
              <Button size="sm" variant="destructive" onClick={() => stop.mutate(executionId)} disabled={stop.isPending}>
                <Square className="h-3 w-3" />
              </Button>
            )}
            {onClose && (
              <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-2">
          {(['variables', 'history', 'breakpoints'] as const).map(tab => (
            <Button
              key={tab}
              size="sm"
              variant={activeTab === tab ? 'secondary' : 'ghost'}
              className="capitalize"
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {tab === 'breakpoints' && breakpoints && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">{breakpoints.length}</Badge>
              )}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {activeTab === 'variables' && (
          <ScrollArea className="h-48">
            {!state?.variables || Object.keys(state.variables).length === 0 ? (
              <p className="text-muted-foreground text-xs">No variables in scope</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pb-1 font-medium">Name</th>
                    <th className="text-left pb-1 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(state.variables).map(([k, v]) => (
                    <tr key={k} className="border-b border-dashed">
                      <td className="py-1 pr-4 text-blue-600">{k}</td>
                      <td className="py-1 text-green-700 truncate max-w-xs">
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
              <p className="text-muted-foreground text-xs">No steps executed yet</p>
            ) : (
              <div className="space-y-1">
                {history.map((snap, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 border-b border-dashed text-xs">
                    <Badge variant={snap.error ? 'destructive' : 'secondary'} className="text-xs">
                      {snap.error ? 'FAIL' : 'OK'}
                    </Badge>
                    <code className="text-blue-600">{snap.step_id}</code>
                    <span className="text-muted-foreground">{snap.action}</span>
                    <span className="ml-auto text-muted-foreground">{Math.round(snap.duration / 1_000_000)}ms</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}

        {activeTab === 'breakpoints' && (
          <ScrollArea className="h-48">
            {!breakpoints || breakpoints.length === 0 ? (
              <p className="text-muted-foreground text-xs">No breakpoints set</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Step</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Hits</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakpoints.map((bp) => (
                    <TableRow key={bp.id} className={bp.enabled ? '' : 'opacity-50'}>
                      <TableCell><code>{bp.step_id ?? '(all)'}</code></TableCell>
                      <TableCell><Badge variant="outline">{bp.type}</Badge></TableCell>
                      <TableCell>{bp.hit_count}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm" variant="ghost" className="h-6 w-6 p-0"
                            onClick={() => toggleBreakpoint.mutate({ executionId, breakpointId: bp.id })}
                            title={bp.enabled ? 'Disable' : 'Enable'}
                          >
                            <ToggleRight className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                            onClick={() => removeBreakpoint.mutate({ executionId, breakpointId: bp.id })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
