'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRunAgent } from '@/lib/hooks/useGraphAgents';
import type { AgentResult, AgentFinding } from '@/lib/api/graph-agents';
import { ArrowLeft, Eye, Loader2, AlertTriangle, TrendingDown, GitBranch } from 'lucide-react';

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
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{finding.title}</h4>
        {severityBadge(finding.severity)}
      </div>
      <p className="text-sm text-muted-foreground">{finding.description}</p>
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

export default function WatchPage() {
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runAgent = useRunAgent();

  const handleRun = async () => {
    setError(null);
    try {
      const data = await runAgent.mutateAsync({ agent: 'watch' });
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to run watch analysis');
    }
  };

  const findings = result?.findings || [];
  const regressions = findings.filter((f) => f.type === 'regression');
  const performanceAlerts = findings.filter((f) => f.type === 'performance_degradation');
  const graphChanges = findings.filter((f) => f.type !== 'regression' && f.type !== 'performance_degradation');

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
          <h1 className="text-3xl font-bold">Watch Agent</h1>
          <p className="text-muted-foreground mt-1">
            Monitor regressions and performance degradation
          </p>
        </div>
        <Button onClick={handleRun} disabled={runAgent.isPending}>
          {runAgent.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Run Watch Analysis
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
            <Eye className="h-12 w-12 mb-4" />
            <p className="text-lg font-medium">No analysis results yet</p>
            <p className="text-sm mt-1">Run the watch analysis to detect regressions and performance issues</p>
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

          {/* Regressions */}
          {regressions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Regressions
                </CardTitle>
                <CardDescription>
                  {regressions.length} regression{regressions.length !== 1 ? 's' : ''} detected
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {regressions.map((finding, i) => (
                  <FindingCard key={i} finding={finding} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Performance Alerts */}
          {performanceAlerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-orange-500" />
                  Performance Alerts
                </CardTitle>
                <CardDescription>
                  {performanceAlerts.length} performance issue{performanceAlerts.length !== 1 ? 's' : ''} detected
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {performanceAlerts.map((finding, i) => (
                  <FindingCard key={i} finding={finding} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Graph Changes */}
          {graphChanges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-primary" />
                  Graph Changes
                </CardTitle>
                <CardDescription>
                  {graphChanges.length} change{graphChanges.length !== 1 ? 's' : ''} detected
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {graphChanges.map((finding, i) => (
                  <FindingCard key={i} finding={finding} />
                ))}
              </CardContent>
            </Card>
          )}

          {regressions.length === 0 && performanceAlerts.length === 0 && graphChanges.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Eye className="h-8 w-8 mb-2" />
                <p>No issues found - everything looks good</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
