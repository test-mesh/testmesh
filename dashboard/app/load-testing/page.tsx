'use client';

import { useState, useEffect } from 'react';
import {
  Zap,
  Play,
  Square,
  Users,
  Clock,
  Activity,
  TrendingUp,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useFlows } from '@/lib/hooks/useFlows';
import {
  useLoadTests,
  useLoadTest,
  useStartLoadTest,
  useStopLoadTest,
} from '@/lib/hooks/useLoadTesting';
import type { LoadTestResult } from '@/lib/api/load-testing';

export default function LoadTestingPage() {
  // Config state
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([]);
  const [virtualUsers, setVirtualUsers] = useState(10);
  const [durationSec, setDurationSec] = useState(60);
  const [rampUpSec, setRampUpSec] = useState(10);
  const [thinkTimeMs, setThinkTimeMs] = useState(0);

  // Active test
  const [activeTestId, setActiveTestId] = useState<string | null>(null);

  // Queries & mutations
  const { data: flowsData, isLoading: isLoadingFlows } = useFlows();
  const { data: loadTestsData } = useLoadTests();
  const { data: activeTest, isLoading: isLoadingTest, error: loadTestError } = useLoadTest(activeTestId || undefined, {
    refetchInterval: activeTestId ? 1000 : undefined,
  });

  // Clear activeTestId if the test no longer exists (404 error)
  useEffect(() => {
    if (loadTestError && activeTestId) {
      setActiveTestId(null);
    }
  }, [loadTestError, activeTestId]);

  const startLoadTest = useStartLoadTest();
  const stopLoadTest = useStopLoadTest();

  // Handlers
  const handleStart = async () => {
    if (selectedFlowIds.length === 0) return;

    const result = await startLoadTest.mutateAsync({
      flow_ids: selectedFlowIds,
      virtual_users: virtualUsers,
      duration_sec: durationSec,
      ramp_up_sec: rampUpSec,
      think_time_ms: thinkTimeMs,
    });

    setActiveTestId(result.id);
  };

  const handleStop = async () => {
    if (!activeTestId) return;
    await stopLoadTest.mutateAsync(activeTestId);
  };

  const toggleFlow = (flowId: string) => {
    setSelectedFlowIds((prev) =>
      prev.includes(flowId) ? prev.filter((id) => id !== flowId) : [...prev, flowId]
    );
  };

  const isRunning = activeTest?.status === 'running';

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Load Testing
          </h1>
          <p className="text-muted-foreground">
            Test your APIs under load with configurable virtual users
          </p>
        </div>

        {isRunning ? (
          <Button variant="destructive" onClick={handleStop} disabled={stopLoadTest.isPending}>
            {stopLoadTest.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Square className="w-4 h-4 mr-2" />
            )}
            Stop Test
          </Button>
        ) : (
          <Button
            onClick={handleStart}
            disabled={selectedFlowIds.length === 0 || startLoadTest.isPending}
          >
            {startLoadTest.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Start Load Test
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Configuration */}
        <div className="space-y-6">
          {/* Flow selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select Flows</CardTitle>
              <CardDescription>Choose flows to include in the load test</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingFlows ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-auto">
                  {flowsData?.flows.map((flow) => (
                    <label
                      key={flow.id}
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors',
                        selectedFlowIds.includes(flow.id)
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFlowIds.includes(flow.id)}
                        onChange={() => toggleFlow(flow.id)}
                        className="rounded"
                        disabled={isRunning}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{flow.name}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Load profile */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Load Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Virtual Users
                  </Label>
                  <span className="text-sm font-medium">{virtualUsers}</span>
                </div>
                <Slider
                  value={[virtualUsers]}
                  onValueChange={(values: number[]) => setVirtualUsers(values[0])}
                  min={1}
                  max={100}
                  step={1}
                  disabled={isRunning}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Duration
                  </Label>
                  <span className="text-sm font-medium">{durationSec}s</span>
                </div>
                <Slider
                  value={[durationSec]}
                  onValueChange={(values: number[]) => setDurationSec(values[0])}
                  min={10}
                  max={300}
                  step={10}
                  disabled={isRunning}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Ramp-up Time</Label>
                  <span className="text-sm font-medium">{rampUpSec}s</span>
                </div>
                <Slider
                  value={[rampUpSec]}
                  onValueChange={(values: number[]) => setRampUpSec(values[0])}
                  min={0}
                  max={60}
                  step={5}
                  disabled={isRunning}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Think Time</Label>
                  <span className="text-sm font-medium">{thinkTimeMs}ms</span>
                </div>
                <Slider
                  value={[thinkTimeMs]}
                  onValueChange={(values: number[]) => setThinkTimeMs(values[0])}
                  min={0}
                  max={5000}
                  step={100}
                  disabled={isRunning}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Results */}
        <div className="col-span-2 space-y-6">
          {activeTest ? (
            <>
              {/* Status card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Test Status</CardTitle>
                    <Badge
                      variant={
                        activeTest.status === 'running'
                          ? 'default'
                          : activeTest.status === 'completed'
                          ? 'secondary'
                          : 'destructive'
                      }
                      className="flex items-center gap-1"
                    >
                      {activeTest.status === 'running' && (
                        <Activity className="w-3 h-3 animate-pulse" />
                      )}
                      {activeTest.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                      {activeTest.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeTest.status === 'running' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span>
                          {Math.round(
                            (activeTest.duration_ms / (durationSec * 1000)) * 100
                          )}
                          %
                        </span>
                      </div>
                      <Progress
                        value={(activeTest.duration_ms / (durationSec * 1000)) * 100}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-4 mt-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{activeTest.metrics.active_vus}</div>
                      <div className="text-xs text-muted-foreground">Active VUs</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{activeTest.total_requests}</div>
                      <div className="text-xs text-muted-foreground">Total Requests</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {activeTest.successful_requests}
                      </div>
                      <div className="text-xs text-muted-foreground">Successful</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {activeTest.failed_requests}
                      </div>
                      <div className="text-xs text-muted-foreground">Failed</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Metrics cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Throughput
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {activeTest.requests_per_second.toFixed(1)}
                    </div>
                    <div className="text-sm text-muted-foreground">requests/sec</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Error Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={cn(
                        'text-3xl font-bold',
                        activeTest.metrics.error_rate > 5
                          ? 'text-red-600'
                          : activeTest.metrics.error_rate > 1
                          ? 'text-yellow-600'
                          : 'text-green-600'
                      )}
                    >
                      {activeTest.metrics.error_rate.toFixed(2)}%
                    </div>
                    <div className="text-sm text-muted-foreground">of requests failed</div>
                  </CardContent>
                </Card>
              </div>

              {/* Response times */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Response Times</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 gap-4 text-center">
                    <div>
                      <div className="text-lg font-bold">
                        {activeTest.metrics.response_times.min_ms}
                      </div>
                      <div className="text-xs text-muted-foreground">Min</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">
                        {activeTest.metrics.response_times.avg_ms.toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">Avg</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">
                        {activeTest.metrics.response_times.median_ms.toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">Median</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">
                        {activeTest.metrics.response_times.p90_ms.toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">P90</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">
                        {activeTest.metrics.response_times.p95_ms.toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">P95</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">
                        {activeTest.metrics.response_times.p99_ms.toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">P99</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">
                        {activeTest.metrics.response_times.max_ms}
                      </div>
                      <div className="text-xs text-muted-foreground">Max</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Errors */}
              {activeTest.errors && activeTest.errors.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-red-600">Errors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {activeTest.errors.map((err, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-950/30 rounded"
                        >
                          <span className="text-sm text-red-700 dark:text-red-400">
                            {err.error}
                          </span>
                          <Badge variant="destructive">{err.count}x</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="col-span-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Zap className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Active Test</h3>
                <p className="text-sm text-muted-foreground text-center mt-1">
                  Configure your load test and click "Start Load Test" to begin
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
