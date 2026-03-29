'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Play,
  Upload,
  FileJson,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  Settings,
  Zap,
  Database,
  Trash2,
  Save,
  Download,
  Search,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';
import { useFlows } from '@/lib/hooks/useFlows';
import { useRunCollection, useParseDataFile } from '@/lib/hooks/useRunner';
import { useDatasets, useUploadDataset, useDeleteDataset, useDatasetContent } from '@/lib/hooks/useDatasets';
import type {
  DataRow,
  CollectionRunConfig,
  CollectionRunResult,
} from '@/lib/api/runner';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016';

export default function RunnerPage() {
  // Flow selection
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([]);
  const [flowSearch, setFlowSearch] = useState('');
  const { data: flowsData, isLoading: isLoadingFlows } = useFlows();

  // Data source
  const [sourceTab, setSourceTab] = useState<'none' | 'upload' | 'saved'>('none');
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

  // Saved dataset
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [saveFileName, setSaveFileName] = useState('');

  // Results
  const [runResult, setRunResult] = useState<CollectionRunResult | null>(null);

  // Mutations
  const parseDataFile = useParseDataFile();
  const runCollection = useRunCollection();

  // Datasets (MinIO-backed)
  const { data: datasetsData } = useDatasets();
  const uploadDataset = useUploadDataset();
  const deleteDataset = useDeleteDataset();
  const { data: datasetContent } = useDatasetContent(selectedDatasetId);

  // Filter flows by search
  const flows = flowsData?.flows || [];
  const filteredFlows = flowSearch
    ? flows.filter(
        (f) =>
          f.name.toLowerCase().includes(flowSearch.toLowerCase()) ||
          f.suite?.toLowerCase().includes(flowSearch.toLowerCase())
      )
    : flows;

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const content = await file.text();
      setDataContent(content);

      const type = file.name.endsWith('.json') ? 'json' : 'csv';
      setDataType(type);

      try {
        const result = await parseDataFile.mutateAsync({ type, content });
        setParsedData({
          columns: result.columns,
          preview: result.preview,
          totalRows: result.total_rows,
        });

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

  // Apply loaded dataset content when it arrives from the hook
  const [appliedDatasetId, setAppliedDatasetId] = useState('');
  if (datasetContent && selectedDatasetId && selectedDatasetId !== appliedDatasetId) {
    setAppliedDatasetId(selectedDatasetId);
    setDataContent(datasetContent.content);
    setDataType(datasetContent.file_type as 'csv' | 'json');
    parseDataFile
      .mutateAsync({
        type: datasetContent.file_type as 'csv' | 'json',
        content: datasetContent.content,
      })
      .then((result) => {
        setParsedData({
          columns: result.columns,
          preview: result.preview,
          totalRows: result.total_rows,
        });
        const mapping: Record<string, string> = {};
        result.columns.forEach((col) => {
          mapping[col] = col;
        });
        setVariableMapping(mapping);
        setIterations(result.total_rows);
      })
      .catch((error) => {
        console.error('Failed to parse dataset:', error);
      });
  }

  // Save current upload as a dataset
  const handleSaveDataset = async (file: File) => {
    try {
      await uploadDataset.mutateAsync({
        file,
        name: saveFileName || file.name,
      });
      setSaveFileName('');
    } catch (error) {
      console.error('Failed to save dataset:', error);
    }
  };

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

  const selectAllFlows = () => {
    if (selectedFlowIds.length === flows.length) {
      setSelectedFlowIds([]);
    } else {
      setSelectedFlowIds(flows.map((f) => f.id));
    }
  };

  const canRun = selectedFlowIds.length > 0 && !runCollection.isPending;

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Data Runner
          </h1>
          <p className="text-muted-foreground text-sm">
            Run test flows with data-driven parameters from CSV or JSON
          </p>
        </div>
        <Button size="lg" onClick={handleRun} disabled={!canRun}>
          {runCollection.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          {runCollection.isPending ? 'Running...' : `Run ${selectedFlowIds.length > 0 ? `${selectedFlowIds.length} Flow${selectedFlowIds.length > 1 ? 's' : ''}` : 'Flows'}`}
        </Button>
      </div>

      {/* Step 1: Select Flows */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                Select Flows
              </CardTitle>
              <CardDescription className="mt-1">
                Choose which test flows to execute
              </CardDescription>
            </div>
            {flows.length > 0 && (
              <div className="flex items-center gap-2">
                {selectedFlowIds.length > 0 && (
                  <Badge variant="secondary">{selectedFlowIds.length} selected</Badge>
                )}
                <Button variant="ghost" size="sm" onClick={selectAllFlows}>
                  {selectedFlowIds.length === flows.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingFlows ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : flows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="w-10 h-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground mb-1">No flows in this workspace yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Create or import test flows first, then come back to run them with data.
              </p>
              <Link href="/flows">
                <Button variant="outline" size="sm">
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Go to Flows
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {flows.length > 5 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search flows..."
                    value={flowSearch}
                    onChange={(e) => setFlowSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              )}
              <div className="space-y-1 max-h-56 overflow-auto">
                {filteredFlows.map((flow) => (
                  <label
                    key={flow.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors',
                      selectedFlowIds.includes(flow.id)
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted/50 border border-transparent'
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
                      {flow.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {flow.description}
                        </div>
                      )}
                    </div>
                    {flow.suite && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {flow.suite}
                      </Badge>
                    )}
                  </label>
                ))}
                {flowSearch && filteredFlows.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No flows matching &ldquo;{flowSearch}&rdquo;
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Data Source */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            Data Source
            <Badge variant="outline" className="text-xs font-normal ml-1">Optional</Badge>
          </CardTitle>
          <CardDescription>
            Attach a CSV or JSON dataset to parameterize your test runs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            value={sourceTab}
            onValueChange={(v) => {
              const tab = v as 'none' | 'upload' | 'saved';
              setSourceTab(tab);
              if (tab === 'none') {
                setDataType('none');
                setSelectedDatasetId('');
                setParsedData(null);
                setDataContent('');
              }
              if (tab === 'upload') {
                setSelectedDatasetId('');
                setParsedData(null);
                setDataContent('');
              }
              if (tab === 'saved') {
                setParsedData(null);
                setDataContent('');
              }
            }}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="none">No Data</TabsTrigger>
              <TabsTrigger value="upload">
                <Upload className="w-3 h-3 mr-1" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="saved">
                <Database className="w-3 h-3 mr-1" />
                Saved{datasetsData?.total ? ` (${datasetsData.total})` : ''}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="none" className="space-y-3">
              <div className="flex items-center gap-4 py-2">
                <Label className="text-sm whitespace-nowrap">Iterations</Label>
                <Input
                  type="number"
                  min={1}
                  value={iterations}
                  onChange={(e) => setIterations(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">
                  Each flow runs this many times without external data
                </span>
              </div>
            </TabsContent>

            <TabsContent value="upload" className="space-y-3">
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <label className="cursor-pointer">
                  <span className="text-sm text-primary hover:underline">
                    Choose a CSV or JSON file
                  </span>
                  <input
                    type="file"
                    accept=".csv,.json"
                    onChange={(e) => {
                      handleFileUpload(e);
                      const file = e.target.files?.[0];
                      if (file) {
                        (window as any).__lastUploadedFile = file;
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-muted-foreground mt-1">Max 50 MB</p>
              </div>
              {parsedData && !selectedDatasetId && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Dataset name (optional)"
                    value={saveFileName}
                    onChange={(e) => setSaveFileName(e.target.value)}
                    className="flex-1 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const file = (window as any).__lastUploadedFile as File | undefined;
                      if (file) handleSaveDataset(file);
                    }}
                    disabled={uploadDataset.isPending}
                  >
                    {uploadDataset.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <Save className="w-3 h-3 mr-1" />
                    )}
                    Save for later
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="saved" className="space-y-3">
              {!datasetsData?.datasets?.length ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No saved datasets yet</p>
                  <p className="text-xs mt-1">
                    Upload a file and click &ldquo;Save for later&rdquo; to store it here.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-auto">
                  {datasetsData.datasets.map((ds) => (
                    <div
                      key={ds.id}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors',
                        selectedDatasetId === ds.id
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-muted/50 border border-transparent'
                      )}
                      onClick={() => {
                        setSelectedDatasetId(ds.id);
                        setAppliedDatasetId('');
                        setParsedData(null);
                      }}
                    >
                      {ds.file_type === 'csv' ? (
                        <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <FileJson className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{ds.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {ds.row_count} rows · {ds.columns?.length || 0} cols · {(ds.size_bytes / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Download"
                          onClick={(e) => {
                            e.stopPropagation();
                            const wsId = getActiveWorkspaceId();
                            window.open(
                              `${API_BASE_URL}/api/v1/workspaces/${wsId}/datasets/${ds.id}/download`,
                              '_blank'
                            );
                          }}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this dataset?')) {
                              deleteDataset.mutate(ds.id);
                              if (selectedDatasetId === ds.id) {
                                setSelectedDatasetId('');
                                setParsedData(null);
                              }
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Data preview */}
          {parsedData && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Data Preview
                </span>
                <Badge variant="outline" className="text-xs">
                  {parsedData.totalRows} row{parsedData.totalRows !== 1 ? 's' : ''} · {parsedData.columns.length} col{parsedData.columns.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="border rounded-md overflow-auto max-h-48">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {parsedData.columns.map((col) => (
                        <TableHead key={col} className="text-xs whitespace-nowrap">
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.preview.map((row, i) => (
                      <TableRow key={i}>
                        {parsedData.columns.map((col) => (
                          <TableCell key={col} className="text-xs py-1.5">
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

      {/* Variable mapping — only show when data is loaded */}
      {parsedData && parsedData.columns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
              Variable Mapping
            </CardTitle>
            <CardDescription>
              Map dataset columns to flow variables (e.g. column &ldquo;email&rdquo; maps to <code className="text-xs">{`{{email}}`}</code> in your flows)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {parsedData.columns.map((col) => (
                <div key={col} className="flex items-center gap-2">
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded w-32 truncate shrink-0">
                    {col}
                  </span>
                  <span className="text-muted-foreground shrink-0">&rarr;</span>
                  <Input
                    value={variableMapping[col] || col}
                    onChange={(e) =>
                      setVariableMapping((prev) => ({
                        ...prev,
                        [col]: e.target.value,
                      }))
                    }
                    className="flex-1 font-mono text-sm h-8"
                    placeholder={`\${${col}}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Run Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Run Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Delay between iterations</Label>
              <Input
                type="number"
                min={0}
                value={delayMs}
                onChange={(e) => setDelayMs(parseInt(e.target.value) || 0)}
                className="w-20 h-8"
              />
              <span className="text-xs text-muted-foreground">ms</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Parallel</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={parallel}
                onChange={(e) => setParallel(parseInt(e.target.value) || 1)}
                className="w-16 h-8"
              />
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
          </div>
        </CardContent>
      </Card>

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
              {runResult.completed_iterations} of {runResult.total_iterations} iterations · {runResult.duration_ms}ms total
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Progress
                value={
                  (runResult.completed_iterations / runResult.total_iterations) * 100
                }
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-3 h-3" />
                  {runResult.passed_iterations} passed
                </span>
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="w-3 h-3" />
                  {runResult.failed_iterations} failed
                </span>
              </div>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-auto">
              {runResult.iteration_results.map((iter) => (
                <div
                  key={iter.iteration}
                  className={cn(
                    'px-3 py-2 rounded-md border text-sm',
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
                    <div className="mt-1 text-xs text-red-600 ml-6">{iter.error}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
