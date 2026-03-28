'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrchestrate } from '@/lib/hooks/useGraphAgents';
import type { OrchestratorResult, AgentResult, AgentFinding, AgentAction } from '@/lib/api/graph-agents';
import { ArrowLeft, Workflow, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

function severityBadge(severity: string) {
  const colors: Record<string, string> = {
    critical: 'border-red-500 text-red-500',
    high: 'border-orange-500 text-orange-500',
    medium: 'border-yellow-500 text-yellow-500',
    low: 'border-green-500 text-green-500',
  };
  return (
    <Badge variant="outline" className={colors[severity] || 'border-muted-foreground text-muted-foreground'}>
      {severity}
    </Badge>
  );
}

function AgentResultCard({ agentName, agentResult }: { agentName: string; agentResult: AgentResult }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="flex items-center gap-2 text-base">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {agentName}
          <Badge variant={agentResult.success ? 'default' : 'destructive'} className="ml-auto">
            {agentResult.success ? 'Success' : 'Failed'}
          </Badge>
        </CardTitle>
        {agentResult.summary && (
          <CardDescription>{agentResult.summary}</CardDescription>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {/* Findings */}
          {(agentResult.findings || []).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Findings ({(agentResult.findings || []).length})
              </h4>
              <div className="space-y-2">
                {(agentResult.findings || []).map((finding, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{finding.title}</span>
                      {severityBadge(finding.severity)}
                    </div>
                    <p className="text-xs text-muted-foreground">{finding.description}</p>
                    {Object.keys(finding.metadata || {}).length > 0 && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1">
                        {Object.entries(finding.metadata).map(([key, value]) => (
                          <div key={key} className="flex gap-1">
                            <span className="text-muted-foreground">{key}:</span>
                            <span className="font-mono">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {(agentResult.actions || []).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Actions ({(agentResult.actions || []).length})
              </h4>
              <div className="space-y-2">
                {(agentResult.actions || []).map((action, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-1">
                    <Badge>{action.type}</Badge>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(agentResult.findings || []).length === 0 && (agentResult.actions || []).length === 0 && (
            <p className="text-sm text-muted-foreground">No findings or actions from this agent.</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function OrchestratorPage() {
  const [eventType, setEventType] = useState('');
  const [executionId, setExecutionId] = useState('');
  const [diff, setDiff] = useState('');
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orchestrate = useOrchestrate();

  const handleRun = async () => {
    if (!eventType) return;
    setError(null);
    try {
      const params: Record<string, any> = {};
      if (eventType === 'execution.failed' && executionId) {
        params.execution_id = executionId;
      }
      if (eventType === 'pr.opened' && diff) {
        params.diff = diff;
      }
      const data = await orchestrate.mutateAsync({ event: eventType, params: Object.keys(params).length > 0 ? params : undefined });
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to run orchestration');
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/analytics">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Orchestrator</h1>
          <p className="text-muted-foreground mt-1">
            Coordinate multiple agents based on events
          </p>
        </div>
      </div>

      {/* Input Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Select an event type and provide optional parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-type">Event Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue placeholder="Select an event type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="execution.failed">execution.failed</SelectItem>
                <SelectItem value="pr.opened">pr.opened</SelectItem>
                <SelectItem value="graph.updated">graph.updated</SelectItem>
                <SelectItem value="scheduled">scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {eventType === 'execution.failed' && (
            <div className="space-y-2">
              <Label htmlFor="execution-id">Execution ID</Label>
              <Input
                id="execution-id"
                placeholder="Enter execution ID..."
                value={executionId}
                onChange={(e) => setExecutionId(e.target.value)}
              />
            </div>
          )}

          {eventType === 'pr.opened' && (
            <div className="space-y-2">
              <Label htmlFor="diff">Diff</Label>
              <textarea
                id="diff"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Paste the PR diff here..."
                value={diff}
                onChange={(e) => setDiff(e.target.value)}
              />
            </div>
          )}

          <Button onClick={handleRun} disabled={orchestrate.isPending || !eventType}>
            {orchestrate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Run Orchestration
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-red-500/50 bg-red-950/20">
          <CardContent className="pt-6">
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      {!result && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Workflow className="h-12 w-12 mb-4" />
            <p className="text-lg font-medium">No orchestration results yet</p>
            <p className="text-sm mt-1">Select an event type and run the orchestration</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
            </CardContent>
          </Card>

          {/* Agents Invoked */}
          {(result.agents_invoked || []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Agents Invoked</CardTitle>
                <CardDescription>
                  {(result.agents_invoked || []).length} agent{(result.agents_invoked || []).length !== 1 ? 's' : ''} were triggered
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(result.agents_invoked || []).map((agent) => (
                    <Badge key={agent} variant="secondary" className="text-sm">
                      {agent}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results by Agent */}
          {Object.keys(result.results || {}).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Results by Agent</h3>
              <div className="space-y-4">
                {Object.entries(result.results || {}).map(([agentName, agentResult]) => (
                  <AgentResultCard key={agentName} agentName={agentName} agentResult={agentResult} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
