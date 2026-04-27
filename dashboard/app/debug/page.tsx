'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bug, ChevronDown, ChevronRight } from 'lucide-react';
import { useDebugSessions } from '@/lib/hooks/useDebug';
import { DebugPanel } from '@/components/debug/DebugPanel';

export default function DebugPage() {
  const { data, isLoading } = useDebugSessions();
  const sessions = data ?? [];
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(
    searchParams.get('session')
  );

  // When sessions load, auto-expand the session from the query param if present
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (sessionParam && sessions.some((s) => s.execution_id === sessionParam)) {
      setExpanded(sessionParam);
    }
  }, [sessions, searchParams]);

  function stateVariant(state: string): 'outline' | 'default' | 'secondary' {
    if (state === 'paused') return 'outline';
    if (state === 'running' || state === 'stepping') return 'default';
    return 'secondary';
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Bug className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold">Debug Sessions</h1>
          <p className="text-muted-foreground">Active flow execution debug sessions</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No active debug sessions. Start a flow execution with the CLI debug flag.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Card key={session.id}>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setExpanded(expanded === session.execution_id ? null : session.execution_id)}
                    >
                      {expanded === session.execution_id
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <div>
                      <CardTitle className="text-sm font-mono">{session.execution_id}</CardTitle>
                      <CardDescription className="text-xs">
                        Flow: <code>{session.flow_id}</code> · {session.step_count} steps
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={stateVariant(session.state)}>{session.state}</Badge>
                </div>
              </CardHeader>
              {expanded === session.execution_id && (
                <CardContent className="pt-0">
                  <DebugPanel
                    executionId={session.execution_id}
                    onClose={() => setExpanded(null)}
                  />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
