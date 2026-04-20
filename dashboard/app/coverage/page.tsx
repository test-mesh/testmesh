'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCoverageGaps, useGenerateFlow } from '@/lib/hooks/useCoverage';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Sparkles } from 'lucide-react';
import type { CoverageGap, TraceGenerateFlowResponse } from '@/lib/api/types';

function RiskBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score > 0.7 ? 'bg-red-500' : score > 0.3 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}</span>
    </div>
  );
}

function GenerateFlowModal({
  result,
  onClose,
  onSave,
}: {
  result: TraceGenerateFlowResponse;
  onClose: () => void;
  onSave: (yaml: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold">Generated Test Flow</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{result.intent}</p>
          </div>
          <Badge variant="outline">{Math.round(result.confidence * 100)}% confidence</Badge>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
            {result.yaml}
          </pre>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => { navigator.clipboard.writeText(result.yaml); }}>
            Copy YAML
          </Button>
          <Button onClick={() => onSave(result.yaml)}>
            <Sparkles className="w-3 h-3 mr-1" />
            Save as flow
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CoveragePage() {
  const router = useRouter();
  const workspaceId = getActiveWorkspaceId();
  const [tab, setTab] = useState<'uncovered' | 'all'>('uncovered');
  const [generatedFlow, setGeneratedFlow] = useState<TraceGenerateFlowResponse | null>(null);
  const [generatingTraceId, setGeneratingTraceId] = useState<string | null>(null);

  const { data, isLoading } = useCoverageGaps(workspaceId, {
    uncovered: tab === 'uncovered',
    sort: 'risk_score',
    limit: 50,
  });

  const generateFlow = useGenerateFlow();

  const handleGenerate = async (gap: CoverageGap) => {
    if (!gap.sample_trace_id || !workspaceId) return;
    setGeneratingTraceId(gap.sample_trace_id);
    try {
      const result = await generateFlow.mutateAsync({ workspaceId, traceId: gap.sample_trace_id });
      setGeneratedFlow(result);
    } finally {
      setGeneratingTraceId(null);
    }
  };

  const handleSaveFlow = (_yaml: string) => {
    router.push('/flows/new');
    setGeneratedFlow(null);
  };

  const gaps = data?.gaps ?? [];

  return (
    <div className="container mx-auto py-8">
      {generatedFlow && (
        <GenerateFlowModal
          result={generatedFlow}
          onClose={() => setGeneratedFlow(null)}
          onSave={handleSaveFlow}
        />
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold">Coverage Gaps</h1>
        <p className="text-muted-foreground mt-1">
          Real-traffic endpoints that have no test flow, ranked by risk.
        </p>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{data.uncovered_count}</div>
              <div className="text-sm text-muted-foreground">Untested endpoints</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{data.total}</div>
              <div className="text-sm text-muted-foreground">Total endpoints seen</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'uncovered' | 'all')}>
        <TabsList>
          <TabsTrigger value="uncovered">
            Uncovered
            {data?.uncovered_count ? (
              <span className="ml-1.5 text-xs bg-red-500 text-white rounded-full px-1.5">
                {data.uncovered_count}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardHeader>
              <CardTitle>Endpoints</CardTitle>
              <CardDescription>
                Sorted by risk score — higher means more traffic, errors, or latency.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!isLoading && gaps.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No endpoints seen yet — send traces to TestMesh to discover your coverage.
                </div>
              )}

              {gaps.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="pb-2 font-medium">Service</th>
                      <th className="pb-2 font-medium">Endpoint</th>
                      <th className="pb-2 font-medium">Calls</th>
                      <th className="pb-2 font-medium">Risk</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {gaps.map((gap) => (
                      <tr key={gap.id} className="py-2">
                        <td className="py-3 text-muted-foreground">{gap.service}</td>
                        <td className="py-3 font-mono">
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded mr-1.5">
                            {gap.method}
                          </span>
                          {gap.route}
                        </td>
                        <td className="py-3">{gap.occurrence_count.toLocaleString()}</td>
                        <td className="py-3">
                          <RiskBar score={gap.risk_score} />
                        </td>
                        <td className="py-3">
                          {gap.has_test_flow ? (
                            <Badge variant="outline" className="text-green-600 border-green-300">
                              Has test
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              No test
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {!gap.has_test_flow && gap.sample_trace_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={generatingTraceId === gap.sample_trace_id}
                              onClick={() => handleGenerate(gap)}
                            >
                              {generatingTraceId === gap.sample_trace_id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3 mr-1" />
                              )}
                              Generate test
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
