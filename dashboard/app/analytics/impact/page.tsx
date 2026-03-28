'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRunAgent } from '@/lib/hooks/useGraphAgents';
import type { AgentResult, AgentFinding } from '@/lib/api/graph-agents';
import { ArrowLeft, GitBranch, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

const severityColor: Record<string, string> = {
  critical: 'border-red-500 text-red-500',
  high: 'border-orange-500 text-orange-500',
  medium: 'border-yellow-500 text-yellow-500',
  low: 'border-green-500 text-green-500',
};

const severityTextColor: Record<string, string> = {
  critical: 'text-red-500',
  high: 'text-orange-500',
  medium: 'text-yellow-500',
  low: 'text-green-500',
};

export default function ImpactPage() {
  const [diff, setDiff] = useState('');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useRunAgent();

  const handleAnalyze = async () => {
    setError(null);
    if (!diff.trim()) {
      setError('Please paste a code diff to analyze');
      return;
    }
    try {
      const data = await mutateAsync({
        agent: 'impact',
        params: { diff: diff.trim() },
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to run impact analysis');
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
          <h1 className="text-3xl font-bold">Graph Impact Analysis</h1>
          <p className="text-muted-foreground mt-1">
            Analyze how code changes impact your test flows
          </p>
        </div>
      </div>

      {/* Diff Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Code Diff</CardTitle>
          <CardDescription>
            Paste a code diff to analyze which test flows and nodes are impacted
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full h-48 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
            placeholder={`Paste your diff here, e.g.:\n\n--- a/src/api/users.go\n+++ b/src/api/users.go\n@@ -10,6 +10,8 @@\n func CreateUser(...) {\n+  // validate email\n+  if !isValidEmail(email) { return err }\n   ...`}
            value={diff}
            onChange={(e) => setDiff(e.target.value)}
          />
          <div className="flex justify-end mt-4">
            <Button onClick={handleAnalyze} disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <GitBranch className="h-4 w-4 mr-2" />
              )}
              Analyze Impact
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-red-500/50 bg-red-950/20">
          <CardContent className="flex items-start gap-4 pt-6">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-400">Analysis Failed</h3>
              <p className="text-sm text-red-300 mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!result && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Impact Analysis Run Yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Paste a code diff above and click &quot;Analyze Impact&quot; to see which
              test flows and graph nodes would be affected by the changes.
            </p>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          {/* Summary */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Impact Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
              <div className="flex gap-4 mt-4">
                <div className="text-sm">
                  <span className="text-muted-foreground">Impacted Flows: </span>
                  <span className="font-medium">{(result.findings || []).length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Actions: </span>
                  <span className="font-medium">{(result.actions || []).length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Impacted Flows */}
          {(result.findings || []).length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Impacted Flows</CardTitle>
                <CardDescription>
                  Test flows and nodes affected by the code changes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(result.findings || []).map((finding: AgentFinding, i: number) => (
                    <div key={i} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-lg font-bold ${severityTextColor[finding.severity] || 'text-gray-500'}`}>
                            {finding.severity === 'critical' ? '!!!' : finding.severity === 'high' ? '!!' : '!'}
                          </span>
                          <h4 className="font-medium">{finding.title}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="shrink-0">
                            {finding.type}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={severityColor[finding.severity] || 'border-gray-500 text-gray-500'}
                          >
                            {finding.severity}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {finding.description}
                      </p>
                      {finding.metadata && Object.keys(finding.metadata).length > 0 && (
                        <div className="bg-muted/50 rounded p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Affected Flow / Node Info</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {Object.entries(finding.metadata).map(([key, value]) => (
                              <div key={key} className="text-xs">
                                <span className="text-muted-foreground">{key}: </span>
                                <span className="font-mono">
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          {(result.actions || []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recommended Actions</CardTitle>
                <CardDescription>
                  Suggested steps based on impact analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(result.actions || []).map((action, i) => (
                    <div key={i} className="flex items-start gap-3 border rounded-lg p-4">
                      <Badge variant="outline" className="shrink-0 mt-0.5">
                        {action.type}
                      </Badge>
                      <div>
                        <p className="text-sm">{action.description}</p>
                        {action.metadata && Object.keys(action.metadata).length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground font-mono whitespace-pre-wrap">
                            {JSON.stringify(action.metadata, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
