'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRunAgent } from '@/lib/hooks/useGraphAgents';
import type { AgentResult, AgentFinding } from '@/lib/api/graph-agents';
import { ArrowLeft, Stethoscope, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';

const severityColor: Record<string, string> = {
  critical: 'border-red-500 text-red-500',
  high: 'border-orange-500 text-orange-500',
  medium: 'border-yellow-500 text-yellow-500',
  low: 'border-green-500 text-green-500',
};

function groupByType(findings: AgentFinding[]): Record<string, AgentFinding[]> {
  const groups: Record<string, AgentFinding[]> = {};
  for (const f of findings) {
    const key = f.type || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  }
  return groups;
}

function MetadataSection({ metadata }: { metadata: Record<string, any> }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(metadata);
  if (keys.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Details ({keys.length} fields)
      </button>
      {open && (
        <div className="mt-2 bg-muted/50 rounded p-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(metadata).map(([key, value]) => (
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
  );
}

export default function DiagnosisPage() {
  const [executionId, setExecutionId] = useState('');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useRunAgent();

  const handleDiagnose = async () => {
    setError(null);
    try {
      const params: Record<string, any> = {};
      if (executionId.trim()) {
        params.execution_id = executionId.trim();
      }
      const data = await mutateAsync({
        agent: 'diagnosis',
        ...(Object.keys(params).length > 0 ? { params } : {}),
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to run diagnosis');
    }
  };

  const grouped = result ? groupByType(result.findings || []) : {};
  const sortedTypes = Object.keys(grouped).sort();

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
          <h1 className="text-3xl font-bold">Graph Diagnosis</h1>
          <p className="text-muted-foreground mt-1">
            Diagnose test failures and identify root causes
          </p>
        </div>
      </div>

      {/* Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Diagnosis Parameters</CardTitle>
          <CardDescription>
            Optionally provide an execution ID to diagnose a specific run
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-md">
              <Label htmlFor="execution-id" className="mb-2 block">
                Execution ID (optional)
              </Label>
              <Input
                id="execution-id"
                placeholder="e.g. exec_abc123..."
                value={executionId}
                onChange={(e) => setExecutionId(e.target.value)}
              />
            </div>
            <Button onClick={handleDiagnose} disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Stethoscope className="h-4 w-4 mr-2" />
              )}
              Diagnose
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-red-500/50 bg-red-950/20">
          <CardContent className="flex items-start gap-4 pt-6">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-400">Diagnosis Failed</h3>
              <p className="text-sm text-red-300 mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!result && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Stethoscope className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Diagnosis Run Yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Click &quot;Diagnose&quot; to analyze recent test failures and identify
              patterns, regressions, and root causes.
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
                Diagnosis Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
              <div className="flex gap-4 mt-4">
                <div className="text-sm">
                  <span className="text-muted-foreground">Findings: </span>
                  <span className="font-medium">{(result.findings || []).length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Actions: </span>
                  <span className="font-medium">{(result.actions || []).length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Findings grouped by type */}
          {sortedTypes.map((type) => (
            <Card key={type} className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Badge variant="outline">{type}</Badge>
                  <span>{grouped[type].length} finding{grouped[type].length !== 1 ? 's' : ''}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {grouped[type].map((finding, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium">{finding.title}</h4>
                        <Badge
                          variant="outline"
                          className={severityColor[finding.severity] || 'border-gray-500 text-gray-500'}
                        >
                          {finding.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {finding.description}
                      </p>
                      <MetadataSection metadata={finding.metadata || {}} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Actions */}
          {(result.actions || []).length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Recommended Actions</CardTitle>
                <CardDescription>
                  Suggested steps to resolve diagnosed issues
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
