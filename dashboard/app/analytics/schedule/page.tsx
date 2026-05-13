'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRunAgent } from '@/lib/hooks/useGraphAgents';
import type { AgentResult, AgentFinding, AgentAction } from '@/lib/api/graph-agents';
import { ArrowLeft, Calendar, Loader2, Lightbulb, ListOrdered, Copy } from 'lucide-react';

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

function FindingCard({ finding }: { finding: AgentFinding }) {
  const metadataEntries = Object.entries(finding.metadata || {});
  const suggestedAction = finding.metadata?.suggested_action;
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{finding.title}</h4>
        {severityBadge(finding.severity)}
      </div>
      <p className="text-sm text-muted-foreground">{finding.description}</p>
      {suggestedAction && (
        <div className="bg-muted/50 rounded p-2 text-sm">
          <span className="font-medium">Suggested action: </span>
          {String(suggestedAction)}
        </div>
      )}
      {metadataEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
          {metadataEntries
            .filter(([key]) => key !== 'suggested_action')
            .map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-muted-foreground">{key}:</span>
                <span className="font-mono text-xs">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({ action }: { action: AgentAction }) {
  const metadataEntries = Object.entries(action.metadata || {});
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Badge>{action.type}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{action.description}</p>
      {metadataEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
          {metadataEntries.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-muted-foreground">{key}:</span>
              <span className="font-mono text-xs">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SchedulePage() {
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runAgent = useRunAgent();

  const handleRun = async () => {
    setError(null);
    try {
      const data = await runAgent.mutateAsync({ agent: 'scheduler_optimizer' });
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to run scheduler optimization');
    }
  };

  const findings = result?.findings || [];
  const priorities = findings.filter((f) => f.type === 'priority_ranking');
  const redundancies = findings.filter((f) => f.type === 'redundancy');
  const recommendations = findings.filter((f) => f.type !== 'priority_ranking' && f.type !== 'redundancy');

  // Group recommendations by type
  const groupedRecommendations = recommendations.reduce<Record<string, AgentFinding[]>>((acc, f) => {
    const key = f.type || 'general';
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

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
          <h1 className="text-3xl font-bold">Scheduler Optimizer</h1>
          <p className="text-muted-foreground mt-1">
            Optimize test scheduling for efficiency and coverage
          </p>
        </div>
        <Button onClick={handleRun} disabled={runAgent.isPending}>
          {runAgent.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Optimize Schedule
        </Button>
      </div>

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
            <Calendar className="h-12 w-12 mb-4" />
            <p className="text-lg font-medium">No optimization results yet</p>
            <p className="text-sm mt-1">Run the scheduler optimizer to get recommendations</p>
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

          {/* Recommendations */}
          {Object.keys(groupedRecommendations).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Recommendations
                </CardTitle>
                <CardDescription>
                  {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''} found
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(groupedRecommendations).map(([type, findings]) => (
                  <div key={type}>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2 capitalize">{type.replace(/_/g, ' ')}</h4>
                    <div className="space-y-3">
                      {findings.map((finding, i) => (
                        <FindingCard key={i} finding={finding} />
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Flow Priorities */}
          {priorities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListOrdered className="h-5 w-5 text-primary" />
                  Flow Priorities
                </CardTitle>
                <CardDescription>
                  Recommended priority rankings for test flows
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 p-3 bg-muted/50 text-sm font-medium text-muted-foreground">
                    <span>#</span>
                    <span>Finding</span>
                    <span>Severity</span>
                    <span>Details</span>
                  </div>
                  {priorities.map((finding, i) => (
                    <div key={i} className="grid grid-cols-[auto_1fr_auto_auto] gap-4 p-3 border-t items-center">
                      <span className="text-sm font-mono text-muted-foreground">{i + 1}</span>
                      <div>
                        <p className="font-medium text-sm">{finding.title}</p>
                        <p className="text-xs text-muted-foreground">{finding.description}</p>
                      </div>
                      {severityBadge(finding.severity)}
                      <div className="text-xs text-muted-foreground">
                        {Object.entries(finding.metadata || {}).map(([k, v]) => (
                          <div key={k}>{k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Redundancy Alerts */}
          {redundancies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Copy className="h-5 w-5 text-orange-500" />
                  Redundancy Alerts
                </CardTitle>
                <CardDescription>
                  {redundancies.length} redundanc{redundancies.length !== 1 ? 'ies' : 'y'} detected
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {redundancies.map((finding, i) => {
                  const affectedFlows = finding.metadata?.affected_flows;
                  return (
                    <div key={i} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{finding.title}</h4>
                        {severityBadge(finding.severity)}
                      </div>
                      <p className="text-sm text-muted-foreground">{finding.description}</p>
                      {affectedFlows && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(Array.isArray(affectedFlows) ? affectedFlows : [affectedFlows]).map((flow: string, fi: number) => (
                            <Badge key={fi} variant="secondary" className="text-xs">{flow}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          {(result.actions || []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Suggested Actions</CardTitle>
                <CardDescription>
                  {(result.actions || []).length} automated action{(result.actions || []).length !== 1 ? 's' : ''} available
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(result.actions || []).map((action, i) => (
                  <ActionCard key={i} action={action} />
                ))}
              </CardContent>
            </Card>
          )}

          {priorities.length === 0 && redundancies.length === 0 && recommendations.length === 0 && (result.actions || []).length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Calendar className="h-8 w-8 mb-2" />
                <p>No optimization recommendations - schedule looks good</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
