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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([]);
  const [flowSearch, setFlowSearch] = useState('');
  const { data: flowsData, isLoading: isLoadingFlows } = useFlows();

  const [sourceTab, setSourceTab] = useState<'none' | 'upload' | 'saved'>('none');
  const [dataType, setDataType] = useState<'csv' | 'json' | 'none'>('none');
  const [dataContent, setDataContent] = useState('');
  const [parsedData, setParsedData] = useState<{
    columns: string[];
    preview: DataRow[];
    totalRows: number;
  } | null>(null);

  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({});
  const [globalVariables, setGlobalVariables] = useState<Record<string, string>>({});

  const [iterations, setIterations] = useState(1);
  const [delayMs, setDelayMs] = useState(0);
  const [stopOnError, setStopOnError] = useState(false);
  const [parallel, setParallel] = useState(1);

  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [saveFileName, setSaveFileName] = useState('');

  const [runResult, setRunResult] = useState<CollectionRunResult | null>(null);

  const parseDataFile = useParseDataFile();
  const runCollection = useRunCollection();

  const { data: datasetsData } = useDatasets();
  const uploadDataset = useUploadDataset();
  const deleteDataset = useDeleteDataset();
  const { data: datasetContent } = useDatasetContent(selectedDatasetId);

  const flows = flowsData?.flows || [];
  const filteredFlows = flowSearch
    ? flows.filter(
        (f) =>
          f.name.toLowerCase().includes(flowSearch.toLowerCase()) ||
          f.suite?.toLowerCase().includes(flowSearch.toLowerCase())
      )
    : flows;

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

  const switchSourceTab = (tab: 'none' | 'upload' | 'saved') => {
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
  };

  const resultStatusStyle =
    runResult?.status === 'completed'
      ? 'bg-teal-400/10 text-teal-400 border border-teal-400/30'
      : runResult?.status === 'failed'
      ? 'bg-red-400/10 text-red-400 border border-red-400/30'
      : 'bg-[#1a2d3d] text-[#4a6480] border border-[#2a3d52]';

  return (
    <div className="px-6 py-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8] flex items-center gap-2">
            <Zap className="w-5 h-5 text-teal-400" />
            Data Runner
          </h1>
          <p className="text-xs text-[#3d5670] mt-0.5">
            Run test flows with data-driven parameters from CSV or JSON
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={!canRun}
          className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
        >
          {runCollection.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {runCollection.isPending
            ? 'Running…'
            : `Run ${selectedFlowIds.length > 0 ? `${selectedFlowIds.length} Flow${selectedFlowIds.length > 1 ? 's' : ''}` : 'Flows'}`}
        </button>
      </div>

      {/* Step 1: Select Flows */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-400 text-[#0b0f18] text-[10px] font-bold">1</span>
            <span className="text-[11px] font-semibold text-[#c8dce8]">Select Flows</span>
            <span className="text-[10px] text-[#4a6480]">Choose which test flows to execute</span>
          </div>
          {flows.length > 0 && (
            <div className="flex items-center gap-2">
              {selectedFlowIds.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-teal-400/10 text-teal-400 border border-teal-400/30">
                  {selectedFlowIds.length} selected
                </span>
              )}
              <button
                onClick={selectAllFlows}
                className="h-6 px-2.5 rounded text-[10px] font-medium text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
              >
                {selectedFlowIds.length === flows.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
        </div>
        <div className="p-4">
          {isLoadingFlows ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[#4a6480]" />
            </div>
          ) : flows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="w-10 h-10 text-[#1e2d3d] mb-3" />
              <p className="text-sm text-[#3d5670] mb-1">No flows in this workspace yet</p>
              <p className="text-xs text-[#2a3d52] mb-4">
                Create or import test flows first, then come back to run them with data.
              </p>
              <Link
                href="/flows"
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Go to Flows
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {flows.length > 5 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#3d5670]" />
                  <Input
                    placeholder="Search flows..."
                    value={flowSearch}
                    onChange={(e) => setFlowSearch(e.target.value)}
                    className="pl-8 h-8 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670]"
                  />
                </div>
              )}
              <div className="space-y-1 max-h-56 overflow-auto">
                {filteredFlows.map((flow) => (
                  <label
                    key={flow.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors border',
                      selectedFlowIds.includes(flow.id)
                        ? 'bg-teal-400/5 border-teal-400/30'
                        : 'hover:bg-[#131b26] border-transparent'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFlowIds.includes(flow.id)}
                      onChange={() => toggleFlow(flow.id)}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[#c8dce8] truncate">{flow.name}</div>
                      {flow.description && (
                        <div className="text-[10px] text-[#4a6480] truncate">{flow.description}</div>
                      )}
                    </div>
                    {flow.suite && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480] border border-[#2a3d52] shrink-0">
                        {flow.suite}
                      </span>
                    )}
                  </label>
                ))}
                {flowSearch && filteredFlows.length === 0 && (
                  <p className="text-xs text-[#4a6480] text-center py-4">
                    No flows matching &ldquo;{flowSearch}&rdquo;
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Data Source */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-400 text-[#0b0f18] text-[10px] font-bold">2</span>
          <span className="text-[11px] font-semibold text-[#c8dce8]">Data Source</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480] border border-[#2a3d52]">Optional</span>
          <span className="text-[10px] text-[#4a6480]">Attach a CSV or JSON dataset to parameterize your test runs</span>
        </div>
        <div className="p-4 space-y-4">
          {/* Source tab pills */}
          <div className="flex gap-1">
            <button
              onClick={() => switchSourceTab('none')}
              className={cn(
                'h-7 px-3 rounded-lg text-xs transition-colors',
                sourceTab === 'none'
                  ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                  : 'text-[#4a6480] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
              )}
            >
              No Data
            </button>
            <button
              onClick={() => switchSourceTab('upload')}
              className={cn(
                'flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs transition-colors',
                sourceTab === 'upload'
                  ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                  : 'text-[#4a6480] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
              )}
            >
              <Upload className="w-3 h-3" />
              Upload
            </button>
            <button
              onClick={() => switchSourceTab('saved')}
              className={cn(
                'flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs transition-colors',
                sourceTab === 'saved'
                  ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                  : 'text-[#4a6480] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
              )}
            >
              <Database className="w-3 h-3" />
              Saved{datasetsData?.total ? ` (${datasetsData.total})` : ''}
            </button>
          </div>

          {/* Tab content: No Data */}
          {sourceTab === 'none' && (
            <div className="flex items-center gap-4 py-2">
              <Label className="text-xs text-[#c8dce8] whitespace-nowrap">Iterations</Label>
              <Input
                type="number"
                min={1}
                value={iterations}
                onChange={(e) => setIterations(parseInt(e.target.value) || 1)}
                className="w-24 h-7 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8]"
              />
              <span className="text-xs text-[#4a6480]">
                Each flow runs this many times without external data
              </span>
            </div>
          )}

          {/* Tab content: Upload */}
          {sourceTab === 'upload' && (
            <div className="space-y-3">
              <div className="border-2 border-dashed border-[#1e2d3d] rounded-lg p-6 text-center hover:border-teal-400/30 transition-colors">
                <Upload className="w-8 h-8 mx-auto mb-2 text-[#3d5670]" />
                <label className="cursor-pointer">
                  <span className="text-xs text-teal-400 hover:text-teal-300 transition-colors">
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
                <p className="text-[10px] text-[#3d5670] mt-1">Max 50 MB</p>
              </div>
              {parsedData && !selectedDatasetId && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Dataset name (optional)"
                    value={saveFileName}
                    onChange={(e) => setSaveFileName(e.target.value)}
                    className="flex-1 h-7 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670]"
                  />
                  <button
                    onClick={() => {
                      const file = (window as any).__lastUploadedFile as File | undefined;
                      if (file) handleSaveDataset(file);
                    }}
                    disabled={uploadDataset.isPending}
                    className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
                  >
                    {uploadDataset.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                    Save for later
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab content: Saved */}
          {sourceTab === 'saved' && (
            !datasetsData?.datasets?.length ? (
              <div className="text-center py-6 text-[#4a6480] text-sm">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No saved datasets yet</p>
                <p className="text-[10px] mt-1 text-[#3d5670]">
                  Upload a file and click &ldquo;Save for later&rdquo; to store it here.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-auto">
                {datasetsData.datasets.map((ds) => (
                  <div
                    key={ds.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border',
                      selectedDatasetId === ds.id
                        ? 'bg-teal-400/5 border-teal-400/30'
                        : 'hover:bg-[#131b26] border-transparent'
                    )}
                    onClick={() => {
                      setSelectedDatasetId(ds.id);
                      setAppliedDatasetId('');
                      setParsedData(null);
                    }}
                  >
                    {ds.file_type === 'csv' ? (
                      <FileSpreadsheet className="w-4 h-4 text-teal-400 shrink-0" />
                    ) : (
                      <FileJson className="w-4 h-4 text-blue-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[#c8dce8] truncate">{ds.name}</div>
                      <div className="text-[10px] text-[#4a6480]">
                        {ds.row_count} rows · {ds.columns?.length || 0} cols · {(ds.size_bytes / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        title="Download"
                        className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-teal-400 hover:bg-teal-400/10 transition-colors"
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
                      </button>
                      <button
                        title="Delete"
                        className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-red-400 hover:bg-red-400/10 transition-colors"
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
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Data preview */}
          {parsedData && (
            <div className="space-y-2 pt-2 border-t border-[#1a2332]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#c8dce8]">Data Preview</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480] border border-[#2a3d52]">
                  {parsedData.totalRows} row{parsedData.totalRows !== 1 ? 's' : ''} · {parsedData.columns.length} col{parsedData.columns.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="rounded-lg border border-[#1e2d3d] overflow-auto max-h-48">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1a2332] bg-[#0b0f18]">
                      {parsedData.columns.map((col) => (
                        <th key={col} className="text-left px-3 py-2 text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a2332]">
                    {parsedData.preview.map((row, i) => (
                      <tr key={i} className="hover:bg-[#131b26]">
                        {parsedData.columns.map((col) => (
                          <td key={col} className="px-3 py-1.5 text-[#7fa8c8] font-mono whitespace-nowrap">
                            {String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Variable Mapping — only when data is loaded */}
      {parsedData && parsedData.columns.length > 0 && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-400 text-[#0b0f18] text-[10px] font-bold">3</span>
            <span className="text-[11px] font-semibold text-[#c8dce8]">Variable Mapping</span>
            <span className="text-[10px] text-[#4a6480]">
              Map dataset columns to flow variables — column &ldquo;email&rdquo; maps to <code className="font-mono text-[#7fa8c8]">{`{{email}}`}</code>
            </span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {parsedData.columns.map((col) => (
                <div key={col} className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-[#0b0f18] border border-[#1a2332] px-2 py-1 rounded text-[#7fa8c8] w-32 truncate shrink-0">
                    {col}
                  </span>
                  <span className="text-[#3d5670] shrink-0">&rarr;</span>
                  <Input
                    value={variableMapping[col] || col}
                    onChange={(e) =>
                      setVariableMapping((prev) => ({
                        ...prev,
                        [col]: e.target.value,
                      }))
                    }
                    className="flex-1 font-mono text-xs h-7 bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670]"
                    placeholder={`\${${col}}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Run Settings */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
          <Settings className="w-3.5 h-3.5 text-[#4a7a96]" />
          <span className="text-[11px] font-semibold text-[#c8dce8]">Run Settings</span>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-[#c8dce8] whitespace-nowrap">Delay between iterations</Label>
              <Input
                type="number"
                min={0}
                value={delayMs}
                onChange={(e) => setDelayMs(parseInt(e.target.value) || 0)}
                className="w-20 h-7 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8]"
              />
              <span className="text-xs text-[#4a6480]">ms</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-[#c8dce8] whitespace-nowrap">Parallel</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={parallel}
                onChange={(e) => setParallel(parseInt(e.target.value) || 1)}
                className="w-16 h-7 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8]"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stopOnError}
                onChange={(e) => setStopOnError(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-[#c8dce8]">Stop on first error</span>
            </label>
          </div>
        </div>
      </div>

      {/* Results */}
      {runResult && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Results</span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#4a6480]">
                {runResult.completed_iterations} of {runResult.total_iterations} iterations · {runResult.duration_ms}ms total
              </span>
              <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded', resultStatusStyle)}>
                {runResult.status}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <div className="h-1.5 bg-[#1a2332] rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-400 rounded-full transition-all"
                  style={{ width: `${(runResult.completed_iterations / runResult.total_iterations) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="flex items-center gap-1 text-teal-400">
                  <CheckCircle2 className="w-3 h-3" />
                  {runResult.passed_iterations} passed
                </span>
                <span className="flex items-center gap-1 text-red-400">
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
                    'px-3 py-2 rounded-lg border text-xs',
                    iter.status === 'passed'
                      ? 'bg-teal-400/5 border-teal-400/20'
                      : 'bg-red-400/5 border-red-400/20'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {iter.status === 'passed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span className="text-[#c8dce8]">Iteration {iter.iteration}</span>
                    </div>
                    <span className="text-[10px] text-[#4a6480]">{iter.duration_ms}ms</span>
                  </div>
                  {iter.error && (
                    <div className="mt-1 text-[10px] text-red-400 ml-5">{iter.error}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
