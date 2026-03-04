'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  Square,
  Bug,
  CircleDot,
  RefreshCw,
  Settings,
  Terminal,
  Activity,
  Variable,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import BreakpointManager from './BreakpointManager';
import VariableInspector from './VariableInspector';

interface DebugSession {
  id: string;
  execution_id: string;
  flow_id: string;
  state: 'idle' | 'running' | 'paused' | 'stepping' | 'terminated';
  current_step: string;
  breakpoints: Breakpoint[];
  variables: Record<string, unknown>;
  step_outputs: Record<string, unknown>;
  started_at: string;
  paused_at?: string;
}

interface Breakpoint {
  id: string;
  type: 'step' | 'conditional' | 'error' | 'assertion';
  step_id?: string;
  condition?: string;
  enabled: boolean;
  hit_count: number;
  log_point?: string;
}

interface StepInfo {
  id: string;
  name: string;
  action: string;
}

interface DebugPanelProps {
  executionId: string;
  flowId: string;
  steps: StepInfo[];
  onClose?: () => void;
  className?: string;
}

export default function DebugPanel({
  executionId,
  flowId,
  steps,
  onClose,
  className,
}: DebugPanelProps) {
  const [session, setSession] = useState<DebugSession | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Start debug session
  const startSession = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/debug/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          execution_id: executionId,
          flow_id: flowId,
        }),
      });

      if (!response.ok) throw new Error('Failed to start session');

      const data = await response.json();
      setSession(data.session);
      setIsConnected(true);
      addLog('Debug session started');
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [executionId, flowId]);

  // End debug session
  const endSession = useCallback(async () => {
    if (!session) return;

    try {
      await fetch(`/api/v1/debug/sessions/${executionId}`, {
        method: 'DELETE',
      });
      setSession(null);
      setIsConnected(false);
      addLog('Debug session ended');
    } catch (error) {
      addLog(`Error ending session: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }, [executionId, session]);

  // Refresh session state
  const refreshSession = useCallback(async () => {
    if (!isConnected) return;

    try {
      const response = await fetch(`/api/v1/debug/sessions/${executionId}`);
      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
      }
    } catch {
      // Ignore refresh errors
    }
  }, [executionId, isConnected]);

  // Debug controls
  const sendCommand = async (command: 'pause' | 'resume' | 'step-over' | 'stop') => {
    try {
      const response = await fetch(`/api/v1/debug/sessions/${executionId}/${command}`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error(`Failed to ${command}`);

      addLog(`Command: ${command}`);
      await refreshSession();
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  // Add breakpoint
  const handleAddBreakpoint = async (stepId: string, type: string = 'step') => {
    try {
      const response = await fetch(`/api/v1/debug/sessions/${executionId}/breakpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_id: stepId, type }),
      });

      if (!response.ok) throw new Error('Failed to add breakpoint');

      addLog(`Breakpoint added at ${stepId}`);
      await refreshSession();
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  };

  // Remove breakpoint
  const handleRemoveBreakpoint = async (breakpointId: string) => {
    try {
      await fetch(`/api/v1/debug/sessions/${executionId}/breakpoints/${breakpointId}`, {
        method: 'DELETE',
      });

      addLog('Breakpoint removed');
      await refreshSession();
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  };

  // Toggle breakpoint
  const handleToggleBreakpoint = async (breakpointId: string) => {
    try {
      await fetch(`/api/v1/debug/sessions/${executionId}/breakpoints/${breakpointId}/toggle`, {
        method: 'POST',
      });

      await refreshSession();
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  };

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!isConnected) return;

    const ws = new WebSocket(`ws://${window.location.host}/ws/executions/${executionId}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type?.startsWith('debug.')) {
        addLog(`Event: ${data.type}`);

        if (data.type === 'debug.paused') {
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  state: 'paused',
                  current_step: data.data?.step_id || prev.current_step,
                  variables: data.data?.variables || prev.variables,
                }
              : null
          );
        } else if (data.type === 'debug.resumed') {
          setSession((prev) => (prev ? { ...prev, state: 'running' } : null));
        } else if (data.type === 'debug.variables') {
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  variables: data.data?.variables || prev.variables,
                  step_outputs: data.data?.step_outputs || prev.step_outputs,
                }
              : null
          );
        }
      }
    };

    ws.onerror = () => {
      addLog('WebSocket error');
    };

    return () => {
      ws.close();
    };
  }, [executionId, isConnected]);

  // Periodic refresh
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(refreshSession, 2000);
    return () => clearInterval(interval);
  }, [isConnected, refreshSession]);

  const stateColors: Record<string, string> = {
    idle: 'bg-gray-500',
    running: 'bg-green-500',
    paused: 'bg-yellow-500',
    stepping: 'bg-blue-500',
    terminated: 'bg-red-500',
  };

  return (
    <div className={cn('flex flex-col h-full border-l bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-orange-500" />
          <span className="font-semibold text-sm">Debug</span>
          {session && (
            <Badge
              variant="secondary"
              className={cn('text-white text-[10px]', stateColors[session.state])}
            >
              {session.state}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={refreshSession} className="h-7 w-7 p-0">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <Settings className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 p-2 border-b bg-muted/30">
        {!isConnected ? (
          <Button size="sm" onClick={startSession} className="h-8">
            <Bug className="w-4 h-4 mr-2" />
            Start Debug Session
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendCommand(session?.state === 'paused' ? 'resume' : 'pause')}
              disabled={session?.state === 'terminated'}
              className="h-8 w-8 p-0"
              title={session?.state === 'paused' ? 'Resume' : 'Pause'}
            >
              {session?.state === 'paused' ? (
                <Play className="w-4 h-4 text-green-500" />
              ) : (
                <Pause className="w-4 h-4 text-yellow-500" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendCommand('step-over')}
              disabled={session?.state !== 'paused'}
              className="h-8 w-8 p-0"
              title="Step Over"
            >
              <SkipForward className="w-4 h-4 text-blue-500" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendCommand('stop')}
              disabled={session?.state === 'terminated'}
              className="h-8 w-8 p-0"
              title="Stop"
            >
              <Square className="w-4 h-4 text-red-500" />
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={endSession} className="h-8 text-xs">
              End Session
            </Button>
          </>
        )}
      </div>

      {/* Current Step */}
      {session?.current_step && (
        <div className="p-2 border-b bg-yellow-50 dark:bg-yellow-950/30">
          <div className="flex items-center gap-2 text-xs">
            <CircleDot className="w-3 h-3 text-yellow-500" />
            <span className="text-muted-foreground">Paused at:</span>
            <span className="font-mono font-medium">{session.current_step}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="breakpoints" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b px-2 h-9">
          <TabsTrigger value="breakpoints" className="text-xs h-7">
            <CircleDot className="w-3 h-3 mr-1" />
            Breakpoints
          </TabsTrigger>
          <TabsTrigger value="variables" className="text-xs h-7">
            <Variable className="w-3 h-3 mr-1" />
            Variables
          </TabsTrigger>
          <TabsTrigger value="console" className="text-xs h-7">
            <Terminal className="w-3 h-3 mr-1" />
            Console
          </TabsTrigger>
        </TabsList>

        <TabsContent value="breakpoints" className="flex-1 m-0">
          <BreakpointManager
            steps={steps}
            breakpoints={session?.breakpoints || []}
            currentStep={session?.current_step}
            onAdd={handleAddBreakpoint}
            onRemove={handleRemoveBreakpoint}
            onToggle={handleToggleBreakpoint}
          />
        </TabsContent>

        <TabsContent value="variables" className="flex-1 m-0">
          <VariableInspector
            variables={session?.variables || {}}
            stepOutputs={session?.step_outputs || {}}
            currentStep={session?.current_step}
          />
        </TabsContent>

        <TabsContent value="console" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-muted-foreground text-center py-4">
                  No logs yet
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="text-muted-foreground">
                    {log}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
