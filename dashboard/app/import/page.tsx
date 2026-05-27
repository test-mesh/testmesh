'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Upload, FileJson, FileText, Terminal, Loader2, CheckCircle2, AlertCircle,
  ArrowRight, FileUp, Sparkles, FileCode, Info, Check,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useParseImport, useImportFlows } from '@/lib/hooks/useImportExport';
import { useImportOpenAPI, useImportPostman } from '@/lib/hooks/useAI';
import { useCollections } from '@/lib/hooks/useCollections';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';
import type { ImportResult, ImportType } from '@/lib/api/import-export';
import type { FlowDefinition, ImportResponse } from '@/lib/api/types';

const TABS = [
  { value: 'traffic', label: 'From Traffic', icon: FileJson },
  { value: 'spec',    label: 'From Spec (AI)', icon: Sparkles },
];

const IMPORT_TYPES: { value: ImportType; label: string; icon: React.ElementType }[] = [
  { value: 'har',     label: 'HAR',     icon: FileJson },
  { value: 'curl',    label: 'cURL',    icon: Terminal },
  { value: 'postman', label: 'Postman', icon: FileText },
];

function ImportPageInner() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'traffic' | 'spec'>(
    searchParams.get('tab') === 'spec' ? 'spec' : 'traffic'
  );

  // Traffic state
  const [importType, setImportType] = useState<ImportType>('har');
  const [content, setContent] = useState('');
  const [parseResult, setParseResult] = useState<ImportResult | null>(null);
  const [selectedFlows, setSelectedFlows] = useState<Set<number>>(new Set());
  const [flowNames, setFlowNames] = useState<Record<number, string>>({});
  const [suite, setSuite] = useState('');
  const [tags, setTags] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [groupRequests, setGroupRequests] = useState(false);
  const [groupedFlowName, setGroupedFlowName] = useState('');

  const parseImport = useParseImport();
  const importFlows = useImportFlows();
  const { data: collectionsData } = useCollections();

  // Spec state
  const [specType, setSpecType] = useState('openapi');
  const [spec, setSpec] = useState('');
  const [createFlows, setCreateFlows] = useState(true);
  const [aiResult, setAiResult] = useState<ImportResponse | null>(null);

  const importOpenAPI = useImportOpenAPI();
  const importPostman = useImportPostman();
  const isAiLoading = importOpenAPI.isPending || importPostman.isPending;

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    if (file.name.endsWith('.har')) {
      setImportType('har');
    } else if (file.name.endsWith('.json')) {
      try {
        const json = JSON.parse(text);
        if (json.log?.entries) setImportType('har');
        else if (json.info?.schema?.includes('postman')) setImportType('postman');
      } catch {}
    }
  }, []);

  const handleParse = async () => {
    if (!content.trim()) return;
    try {
      const result = await parseImport.mutateAsync({ type: importType, content });
      setParseResult(result);
      setSelectedFlows(new Set(result.flows.map((_, i) => i)));
      setFlowNames({});
      setImportSuccess(false);
      setImportErrors([]);
      if (!groupedFlowName) {
        setGroupedFlowName(
          importType === 'har' ? 'Imported HAR Flow'
          : importType === 'postman' ? 'Imported Postman Collection'
          : 'Imported Flow'
        );
      }
    } catch (error) {
      console.error('Parse failed:', error);
    }
  };

  const handleImport = async () => {
    if (!parseResult) return;
    const selectedList = parseResult.flows
      .map((f, i) => (flowNames[i] ? { ...f, name: flowNames[i] } : f))
      .filter((_, i) => selectedFlows.has(i));
    if (selectedList.length === 0) return;

    const flowsToImport =
      groupRequests && selectedList.length > 1
        ? [{
            name: groupedFlowName || 'Imported Flow',
            description: `${selectedList.length} requests imported from ${importType.toUpperCase()}`,
            suite: suite || '',
            tags: tags ? tags.split(',').map((t) => t.trim()) : [],
            steps: selectedList.flatMap((f, fi) =>
              (f.steps || []).map((s, si) => ({ ...s, id: `step_${fi + 1}_${si + 1}` }))
            ),
          } as FlowDefinition]
        : selectedList;

    setImportErrors([]);
    try {
      const result = await importFlows.mutateAsync({
        flows: flowsToImport,
        suite: suite || undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
        collection_id: collectionId && collectionId !== 'none' ? collectionId : undefined,
      });
      if (result.errors && result.errors.length > 0) setImportErrors(result.errors);
      if (result.stats.succeeded > 0) {
        setImportedCount(result.stats.succeeded);
        setImportSuccess(true);
      }
    } catch (error) {
      console.error('Import failed:', error);
      setImportErrors(['Import request failed. Please try again.']);
    }
  };

  const toggleFlow = (index: number) => {
    const s = new Set(selectedFlows);
    s.has(index) ? s.delete(index) : s.add(index);
    setSelectedFlows(s);
  };

  const toggleAll = () => {
    if (!parseResult) return;
    setSelectedFlows(
      selectedFlows.size === parseResult.flows.length
        ? new Set()
        : new Set(parseResult.flows.map((_, i) => i))
    );
  };

  const handleAiImport = async () => {
    try {
      let response: ImportResponse;
      const workspaceId = getActiveWorkspaceId() ?? undefined;
      if (specType === 'openapi') {
        response = await importOpenAPI.mutateAsync({ spec, create_flows: createFlows, workspace_id: workspaceId });
      } else if (specType === 'postman') {
        response = await importPostman.mutateAsync({ collection: spec, create_flows: createFlows, workspace_id: workspaceId });
      } else return;
      setAiResult(response);
    } catch (error) {
      console.error('AI import failed:', error);
    }
  };

  const getSpecPlaceholder = () => {
    if (specType === 'openapi') return 'Paste your OpenAPI/Swagger specification (JSON or YAML)...';
    if (specType === 'postman') return 'Paste your Postman collection JSON...';
    return '';
  };

  const pillBtn = (active: boolean) => cn(
    'h-7 px-3 rounded-lg text-xs font-medium border transition-colors',
    active
      ? 'bg-teal-400/15 text-teal-400 border-teal-400/30'
      : 'text-[#4a6480] bg-[#0f1923] border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
  );

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-[#3d5670]" />
        <h1 className="text-xl font-semibold text-[#c8dce8]">Import</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Import flows from traffic captures or generate from API specifications</p>
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-1">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button key={value} onClick={() => setMode(value as 'traffic' | 'spec')} className={cn(pillBtn(mode === value), 'flex items-center gap-1.5')}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── FROM TRAFFIC ── */}
      {mode === 'traffic' && (
        <div className="grid grid-cols-2 gap-5">
          {/* Source */}
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1a2332]">
              <span className="text-[11px] font-semibold text-[#c8dce8]">Source</span>
              <span className="text-[10px] text-[#4a6480] ml-2">Paste content or upload a file</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Type selector */}
              <div className="flex gap-1">
                {IMPORT_TYPES.map(({ value, label, icon: Icon }) => (
                  <button key={value} onClick={() => setImportType(value)} className={cn(pillBtn(importType === value), 'flex items-center gap-1')}>
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>

              {importType !== 'curl' && (
                <div className="flex items-center justify-between rounded-lg border border-[#1a2332] bg-[#0b0f18] px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-[#c8dce8]">Group into one flow</p>
                    <p className="text-[10px] text-[#4a6480]">Combine all requests as steps in a single flow</p>
                  </div>
                  <Switch checked={groupRequests} onCheckedChange={setGroupRequests} />
                </div>
              )}

              <div className="border-2 border-dashed border-[#1e2d3d] rounded-lg p-4 text-center hover:border-[#2a3d52] transition-colors">
                <FileUp className="w-5 h-5 mx-auto mb-2 text-[#3d5670]" />
                <label className="cursor-pointer">
                  <span className="text-xs text-teal-400 hover:text-teal-300 transition-colors">Upload file</span>
                  <input type="file" accept={importType === 'curl' ? '.txt,.sh' : '.json,.har'} onChange={handleFileUpload} className="hidden" />
                </label>
                <p className="text-[10px] text-[#3d5670] mt-1">
                  {importType === 'har' && '.har or .json files'}
                  {importType === 'curl' && '.txt or .sh files'}
                  {importType === 'postman' && '.json files (Postman v2.1)'}
                </p>
              </div>

              <div>
                <Label className="text-[11px] text-[#7fa8c8]">Or paste content</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={importType === 'curl' ? "curl -X GET 'https://api.example.com/users'" : 'Paste JSON content here...'}
                  className="mt-1.5 font-mono text-xs bg-[#0b0f18] border-[#1a2332] text-[#c8dce8] placeholder-[#3d5670] resize-y min-h-[140px]"
                  rows={10}
                />
              </div>

              <button
                onClick={handleParse}
                disabled={!content.trim() || parseImport.isPending}
                className="w-full h-8 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                {parseImport.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                Parse
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1a2332]">
              <span className="text-[11px] font-semibold text-[#c8dce8]">Preview</span>
              <span className="text-[10px] text-[#4a6480] ml-2">
                {parseResult ? `${parseResult.flows.length} flows parsed` : 'Parse content to preview flows'}
              </span>
            </div>
            <div className="p-4 space-y-4">
              {parseResult?.warnings && parseResult.warnings.length > 0 && (
                <div className="rounded-lg bg-yellow-400/5 border border-yellow-400/20 p-3">
                  <div className="flex items-center gap-2 text-xs text-yellow-400 mb-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {parseResult.warnings.length} warning(s)
                  </div>
                  <ul className="space-y-0.5">
                    {parseResult.warnings.slice(0, 3).map((w, i) => <li key={i} className="text-[10px] text-yellow-400/70">{w}</li>)}
                    {parseResult.warnings.length > 3 && <li className="text-[10px] text-yellow-400/50">...and {parseResult.warnings.length - 3} more</li>}
                  </ul>
                </div>
              )}

              {parseResult && parseResult.flows.length > 0 ? (
                <>
                  <div className="rounded-lg border border-[#1a2332] overflow-auto max-h-64">
                    <div className="divide-y divide-[#1a2332]">
                      <div className="grid grid-cols-[auto_1fr_auto] gap-0">
                        <div className="px-3 py-2 bg-[#0b0f18]">
                          <Checkbox
                            checked={selectedFlows.size === parseResult.flows.length}
                            onCheckedChange={toggleAll}
                          />
                        </div>
                        <div className="px-3 py-2 bg-[#0b0f18] text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Name</div>
                        <div className="px-3 py-2 bg-[#0b0f18] text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Steps</div>
                      </div>
                      {parseResult.flows.map((flow, i) => (
                        <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-0 hover:bg-[#131b26] transition-colors">
                          <div className="px-3 py-2 flex items-center">
                            <Checkbox checked={selectedFlows.has(i)} onCheckedChange={() => toggleFlow(i)} />
                          </div>
                          <div className="px-2 py-1.5 flex items-center">
                            <input
                              type="text"
                              value={flowNames[i] ?? flow.name}
                              onChange={(e) => setFlowNames((prev) => ({ ...prev, [i]: e.target.value }))}
                              className="w-full bg-transparent text-xs font-medium text-[#c8dce8] border-0 border-b border-transparent hover:border-[#2a3d52] focus:border-teal-400/50 focus:outline-none px-0 py-0.5 transition-colors"
                            />
                          </div>
                          <div className="px-3 py-2 flex items-center">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96]">{flow.steps?.length || 0}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {groupRequests && (
                      <div>
                        <Label className="text-[11px] text-[#7fa8c8]">Flow name</Label>
                        <Input value={groupedFlowName} onChange={(e) => setGroupedFlowName(e.target.value)} placeholder="Grouped flow name" className="mt-1 h-7 text-xs bg-[#0b0f18] border-[#1a2332] text-[#c8dce8] placeholder-[#3d5670]" />
                      </div>
                    )}
                    <div>
                      <Label className="text-[11px] text-[#7fa8c8]">Suite</Label>
                      <Input value={suite} onChange={(e) => setSuite(e.target.value)} placeholder="Optional suite name" className="mt-1 h-7 text-xs bg-[#0b0f18] border-[#1a2332] text-[#c8dce8] placeholder-[#3d5670]" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-[#7fa8c8]">Tags (comma-separated)</Label>
                      <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="imported, api" className="mt-1 h-7 text-xs bg-[#0b0f18] border-[#1a2332] text-[#c8dce8] placeholder-[#3d5670]" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-[#7fa8c8]">Collection</Label>
                      <Select value={collectionId} onValueChange={setCollectionId}>
                        <SelectTrigger className="mt-1 h-7 text-xs bg-[#0b0f18] border-[#1a2332] text-[#c8dce8]">
                          <SelectValue placeholder="No collection" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No collection</SelectItem>
                          {collectionsData?.collections.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {importErrors.length > 0 && (
                    <div className="rounded-lg bg-red-400/5 border border-red-400/20 p-3">
                      <div className="flex items-center gap-2 text-xs text-red-400 mb-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {importErrors.length} error(s) during import
                      </div>
                      <ul className="space-y-0.5">
                        {importErrors.slice(0, 3).map((e, i) => <li key={i} className="text-[10px] text-red-400/70">{e}</li>)}
                        {importErrors.length > 3 && <li className="text-[10px] text-red-400/50">...and {importErrors.length - 3} more</li>}
                      </ul>
                    </div>
                  )}

                  {importSuccess ? (
                    <div className="rounded-lg bg-teal-400/5 border border-teal-400/20 p-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                      <span className="text-xs text-teal-400">Successfully imported {importedCount} flow(s)</span>
                    </div>
                  ) : (
                    <button
                      onClick={handleImport}
                      disabled={selectedFlows.size === 0 || importFlows.isPending}
                      className="w-full h-8 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {importFlows.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {groupRequests && selectedFlows.size > 1
                        ? `Import as 1 Flow (${selectedFlows.size} steps)`
                        : `Import ${selectedFlows.size} Flow(s)`}
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileJson className="w-8 h-8 mx-auto mb-2 text-[#1e2d3d]" />
                  <p className="text-xs text-[#4a6480]">Parse content to see preview</p>
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          {parseResult && (
            <div className="col-span-2 rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-[#c8dce8]">{parseResult.stats.total_requests}</p>
                  <p className="text-xs text-[#4a6480]">Total Requests</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-teal-400">{parseResult.stats.successful_flows}</p>
                  <p className="text-xs text-[#4a6480]">Converted to Flows</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-400">{parseResult.stats.skipped_requests}</p>
                  <p className="text-xs text-[#4a6480]">Skipped</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FROM SPEC (AI) ── */}
      {mode === 'spec' && !aiResult && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#4a6480]" />
            <span className="text-[11px] font-semibold text-[#c8dce8]">Generate flows from API specification</span>
            <span className="text-[10px] text-[#4a6480]">AI analyzes your spec and generates test flows with assertions</span>
          </div>
          <div className="p-4 space-y-4">
            {/* Spec type */}
            <div className="space-y-2">
              <div className="flex gap-1">
                {[
                  { value: 'openapi', label: 'OpenAPI / Swagger' },
                  { value: 'postman', label: 'Postman Collection' },
                ].map(({ value, label }) => (
                  <button key={value} onClick={() => setSpecType(value)} className={pillBtn(specType === value)}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#4a6480]">
                {specType === 'openapi'
                  ? 'Import OpenAPI 3.0 or Swagger 2.0 — generates flows for each endpoint with smart assertions.'
                  : 'Import a Postman collection spec to generate AI-enriched test flows with assertions.'}
              </p>
            </div>

            <div>
              <Label className="text-[11px] text-[#7fa8c8]">Specification content</Label>
              <Textarea
                placeholder={getSpecPlaceholder()}
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
                className="mt-1.5 font-mono text-xs bg-[#0b0f18] border-[#1a2332] text-[#c8dce8] placeholder-[#3d5670] min-h-64"
                disabled={isAiLoading}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="createFlows" checked={createFlows} onCheckedChange={(checked) => setCreateFlows(checked as boolean)} />
              <Label htmlFor="createFlows" className="text-xs text-[#7fa8c8] cursor-pointer">
                Automatically save flows to the database
              </Label>
            </div>

            <button
              onClick={handleAiImport}
              disabled={!spec.trim() || isAiLoading}
              className="w-full h-8 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {isAiLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating flows…</> : <><Sparkles className="w-3.5 h-3.5" />Generate Flows</>}
            </button>

            {(importOpenAPI.isError || importPostman.isError) && (
              <div className="rounded-lg bg-red-400/5 border border-red-400/20 p-3">
                <div className="flex items-center gap-2 text-xs text-red-400 mb-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Generation failed
                </div>
                <p className="text-[10px] text-red-400/70">
                  {(() => {
                    const err = importOpenAPI.error || importPostman.error;
                    return err instanceof Error ? err.message : 'An unknown error occurred';
                  })()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'spec' && aiResult && (
        <div className="space-y-4">
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-teal-400" />
              <span className="text-[11px] font-semibold text-[#c8dce8]">
                {aiResult.flows_generated} flow{aiResult.flows_generated !== 1 ? 's' : ''} generated
              </span>
            </div>
            <div className="p-4 space-y-4">
              {aiResult.detected_base_url && aiResult.service_var_name && (
                <div className="rounded-lg bg-teal-400/5 border border-teal-400/20 p-3 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-teal-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-teal-400/80">
                    Generated flows use{' '}
                    <code className="font-mono bg-[#0b0f18] px-1 py-0.5 rounded text-teal-400">
                      {`{{${aiResult.service_var_name}}}`}
                    </code>{' '}
                    as the base URL. Add this to your environment with value{' '}
                    <code className="font-mono bg-[#0b0f18] px-1 py-0.5 rounded text-teal-400">
                      {aiResult.detected_base_url}
                    </code>.
                  </p>
                </div>
              )}

              {aiResult.flows && aiResult.flows.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-2">Generated flows</p>
                  <div className="rounded-lg border border-[#1a2332] divide-y divide-[#1a2332] overflow-hidden">
                    {aiResult.flows.map((flow) => (
                      <Link
                        key={flow.id}
                        href={`/flows/${flow.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#131b26] transition-colors"
                      >
                        <FileCode className="h-3.5 w-3.5 text-[#3d5670] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#c8dce8] truncate">{flow.name}</p>
                          {flow.description && <p className="text-[10px] text-[#4a6480] truncate">{flow.description}</p>}
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96]">
                          {flow.definition?.steps?.length || 0} steps
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Link href="/flows" className="h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors flex items-center">
                  View All Flows
                </Link>
                <button
                  onClick={() => { setAiResult(null); setSpec(''); }}
                  className="h-7 px-3 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
                >
                  Import More
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportPage() {
  return (
    <Suspense>
      <ImportPageInner />
    </Suspense>
  );
}
