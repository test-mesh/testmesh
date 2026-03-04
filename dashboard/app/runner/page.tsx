'use client';

import { useState, useCallback } from 'react';
import {
  Play,
  Upload,
  FileJson,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  Pause,
  RotateCcw,
  Settings,
  Table as TableIcon,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useFlows } from '@/lib/hooks/useFlows';
import { useRunCollection, useParseDataFile } from '@/lib/hooks/useRunner';
import type {
  DataRow,
  CollectionRunConfig,
  CollectionRunResult,
  IterationResult,
} from '@/lib/api/runner';

export default function RunnerPage() {
  // Flow selection
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([]);
  const { data: flowsData, isLoading: isLoadingFlows } = useFlows();

  // Data source
  const [dataType, setDataType] = useState<'csv' | 'json' | 'none'>('none');
  const [dataContent, setDataContent] = useState('');
  const [parsedData, setParsedData] = useState<{
    columns: string[];
    preview: DataRow[];
    totalRows: number;
  } | null>(null);

  // Variable mapping
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({});
  const [globalVariables, setGlobalVariables] = useState<Record<string, string>>({});

  // Run config
  const [iterations, setIterations] = useState(1);
  const [delayMs, setDelayMs] = useState(0);
  const [stopOnError, setStopOnError] = useState(false);
  const [parallel, setParallel] = useState(1);

  // Results
  const [runResult, setRunResult] = useState<CollectionRunResult | null>(null);

  // Mutations
  const parseDataFile = useParseDataFile();
  const runCollection = useRunCollection();

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const content = await file.text();
      setDataContent(content);

      // Detect type from extension
      const type = file.name.endsWith('.json') ? 'json' : 'csv';
      setDataType(type);

      // Parse the file
      try {
        const result = await parseDataFile.mutateAsync({ type, content });
        setParsedData({
          columns: result.columns,
          preview: result.preview,
          totalRows: result.total_rows,
        });

        // Initialize variable mapping
        const mapping: Record<string, string> = {};
        result.columns.forEach((col) => {
          mapping[col] = col;
        });
        setVariableMapping(mapping);
        setIterations(result.total_rows);
      } catch (error) {
        console.error('Failed to parse file:', error);
      }
    },
    [parseDataFile]
  );

  // Handle run
  const handleRun = async () => {
    const config: CollectionRunConfig = {
      flow_ids: selectedFlowIds,
      iterations: dataType === 'none' ? iterations : undefined,
      delay_ms: delayMs,
      stop_on_error: stopOnError,
      parallel,
      variables: globalVariables,
      variable_mapping: variableMapping,
    };

    if (dataType !== 'none' && dataContent) {
      config.data_source = {
        type: dataType,
        content: dataContent,
      };
    }

    try {
      const result = await runCollection.mutateAsync(config);
      setRunResult(result);
    } catch (error) {
      console.error('Failed to run collection:', error);
    }
  };

  // Toggle flow selection
  const toggleFlow = (flowId: string) => {
    setSelectedFlowIds((prev) =>
      prev.includes(flowId) ? prev.filter((id) => id !== flowId) : [...prev, flowId]
    );
  };

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Collection Runner
          </h1>
          <p className="text-muted-foreground">
            Run flows with data-driven testing using CSV or JSON files
          </p>
        </div>
        <Button
          size="lg"
          onClick={handleRun}
          disabled={selectedFlowIds.length === 0 || runCollection.isPending}
        >
          {runCollection.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Run Collection
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left column - Configuration */}
        <div className="space-y-6">
          {/* Flow selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Select Flows</CardTitle>
              <CardDescription>
                Choose which flows to run in this collection
              </CardDescription>
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
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{flow.name}</div>
                        {flow.suite && (
                          <div className="text-xs text-muted-foreground">{flow.suite}</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {selectedFlowIds.length > 0 && (
                <div className="mt-3 text-sm text-muted-foreground">
                  {selectedFlowIds.length} flow(s) selected
                </div>
              )}
            </CardContent>
          </Card>

          {/* Data source */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data Source</CardTitle>
              <CardDescription>
                Upload a CSV or JSON file for data-driven testing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={dataType} onValueChange={(v: any) => setDataType(v)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="none">No Data</TabsTrigger>
                  <TabsTrigger value="csv">CSV</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="none" className="space-y-3">
                  <div>
                    <Label className="text-sm">Iterations</Label>
                    <Input
                      type="number"
                      min={1}
                      value={iterations}
                      onChange={(e) => setIterations(parseInt(e.target.value) || 1)}
                      className="w-24 mt-1"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="csv" className="space-y-3">
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <label className="cursor-pointer">
                      <span className="text-sm text-primary hover:underline">
                        Upload CSV file
                      </span>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </TabsContent>

                <TabsContent value="json" className="space-y-3">
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <FileJson className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <label className="cursor-pointer">
                      <span className="text-sm text-primary hover:underline">
                        Upload JSON file
                      </span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Data preview */}
              {parsedData && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Data Preview ({parsedData.totalRows} rows)
                    </span>
                  </div>
                  <div className="border rounded-md overflow-auto max-h-48">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {parsedData.columns.map((col) => (
                            <TableHead key={col} className="text-xs">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.preview.map((row, i) => (
                          <TableRow key={i}>
                            {parsedData.columns.map((col) => (
                              <TableCell key={col} className="text-xs">
                                {String(row[col] ?? '')}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Run settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Run Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Delay (ms)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={delayMs}
                    onChange={(e) => setDelayMs(parseInt(e.target.value) || 0)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm">Parallel</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={parallel}
                    onChange={(e) => setParallel(parseInt(e.target.value) || 1)}
                    className="mt-1"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={stopOnError}
                  onChange={(e) => setStopOnError(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Stop on first error</span>
              </label>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Results */}
        <div className="space-y-6">
          {/* Variable mapping */}
          {parsedData && parsedData.columns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Variable Mapping</CardTitle>
                <CardDescription>
                  Map data columns to flow variables
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {parsedData.columns.map((col) => (
                  <div key={col} className="flex items-center gap-2">
                    <span className="text-sm font-mono bg-muted px-2 py-1 rounded w-32 truncate">
                      {col}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <Input
                      value={variableMapping[col] || col}
                      onChange={(e) =>
                        setVariableMapping((prev) => ({
                          ...prev,
                          [col]: e.target.value,
                        }))
                      }
                      className="flex-1 font-mono text-sm"
                      placeholder={`$\{${col}}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {runResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Results</span>
                  <Badge
                    variant={
                      runResult.status === 'completed'
                        ? 'default'
                        : runResult.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {runResult.status}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {runResult.completed_iterations} of {runResult.total_iterations} iterations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress */}
                <div className="space-y-2">
                  <Progress
                    value={
                      (runResult.completed_iterations / runResult.total_iterations) * 100
                    }
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="text-green-600">
                      {runResult.passed_iterations} passed
                    </span>
                    <span className="text-red-600">
                      {runResult.failed_iterations} failed
                    </span>
                    <span>{runResult.duration_ms}ms</span>
                  </div>
                </div>

                {/* Iteration results */}
                <div className="space-y-2 max-h-64 overflow-auto">
                  {runResult.iteration_results.map((iter) => (
                    <div
                      key={iter.iteration}
                      className={cn(
                        'p-2 rounded-md border text-sm',
                        iter.status === 'passed'
                          ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900'
                          : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {iter.status === 'passed' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          <span>Iteration {iter.iteration}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {iter.duration_ms}ms
                        </span>
                      </div>
                      {iter.error && (
                        <div className="mt-1 text-xs text-red-600">{iter.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
