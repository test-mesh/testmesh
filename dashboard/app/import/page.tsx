'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Upload,
  FileJson,
  FileText,
  Terminal,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  FileUp,
  Sparkles,
  FileCode,
  Info,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useParseImport, useImportFlows } from '@/lib/hooks/useImportExport';
import { useImportOpenAPI, useImportPostman } from '@/lib/hooks/useAI';
import { useCollections } from '@/lib/hooks/useCollections';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';
import type { ImportResult, ImportType } from '@/lib/api/import-export';
import type { FlowDefinition, ImportResponse } from '@/lib/api/types';

function ImportPageInner() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'traffic' | 'spec'>(
    searchParams.get('tab') === 'spec' ? 'spec' : 'traffic'
  );

  // ── Traffic import state ──────────────────────────────────────────────────
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

  // ── Spec (AI) import state ────────────────────────────────────────────────
  const [specType, setSpecType] = useState('openapi');
  const [spec, setSpec] = useState('');
  const [createFlows, setCreateFlows] = useState(true);
  const [aiResult, setAiResult] = useState<ImportResponse | null>(null);

  const importOpenAPI = useImportOpenAPI();
  const importPostman = useImportPostman();
  const isAiLoading = importOpenAPI.isPending || importPostman.isPending;

  // ── Traffic handlers ──────────────────────────────────────────────────────
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
          importType === 'har'
            ? 'Imported HAR Flow'
            : importType === 'postman'
            ? 'Imported Postman Collection'
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
        ? [
            {
              name: groupedFlowName || 'Imported Flow',
              description: `${selectedList.length} requests imported from ${importType.toUpperCase()}`,
              suite: suite || '',
              tags: tags ? tags.split(',').map((t) => t.trim()) : [],
              steps: selectedList.flatMap((f, fi) =>
                (f.steps || []).map((s, si) => ({
                  ...s,
                  id: `step_${fi + 1}_${si + 1}`,
                }))
              ),
            } as FlowDefinition,
          ]
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

  // ── AI spec handlers ──────────────────────────────────────────────────────
  const handleAiImport = async () => {
    try {
      let response: ImportResponse;
      const workspaceId = getActiveWorkspaceId() ?? undefined;
      switch (specType) {
        case 'openapi':
          response = await importOpenAPI.mutateAsync({ spec, create_flows: createFlows, workspace_id: workspaceId });
          break;
        case 'postman':
          response = await importPostman.mutateAsync({ collection: spec, create_flows: createFlows, workspace_id: workspaceId });
          break;
        default:
          return;
      }
      setAiResult(response);
    } catch (error) {
      console.error('AI import failed:', error);
    }
  };

  const getSpecPlaceholder = () => {
    switch (specType) {
      case 'openapi': return 'Paste your OpenAPI/Swagger specification (JSON or YAML)...';
      case 'postman': return 'Paste your Postman collection JSON...';
      default: return '';
    }
  };

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="w-6 h-6 text-primary" />
          Import
        </h1>
        <p className="text-muted-foreground">
          Import flows from traffic captures or generate them from API specifications
        </p>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as 'traffic' | 'spec')}>
        <TabsList>
          <TabsTrigger value="traffic" className="flex items-center gap-1.5">
            <FileJson className="w-3.5 h-3.5" />
            From Traffic
          </TabsTrigger>
          <TabsTrigger value="spec" className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            From Spec (AI)
          </TabsTrigger>
        </TabsList>

        {/* ── FROM TRAFFIC ── */}
        <TabsContent value="traffic" className="mt-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Input */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Source</CardTitle>
                <CardDescription>Paste content or upload a file</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={importType} onValueChange={(v) => setImportType(v as ImportType)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="har" className="flex items-center gap-1">
                      <FileJson className="w-3 h-3" />
                      HAR
                    </TabsTrigger>
                    <TabsTrigger value="curl" className="flex items-center gap-1">
                      <Terminal className="w-3 h-3" />
                      cURL
                    </TabsTrigger>
                    <TabsTrigger value="postman" className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      Postman
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {importType !== 'curl' && (
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Group into one flow</p>
                      <p className="text-xs text-muted-foreground">
                        Combine all requests as steps in a single flow
                      </p>
                    </div>
                    <Switch checked={groupRequests} onCheckedChange={setGroupRequests} />
                  </div>
                )}

                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  <FileUp className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                  <label className="cursor-pointer">
                    <span className="text-sm text-primary hover:underline">Upload file</span>
                    <input
                      type="file"
                      accept={importType === 'curl' ? '.txt,.sh' : '.json,.har'}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {importType === 'har' && '.har or .json files'}
                    {importType === 'curl' && '.txt or .sh files'}
                    {importType === 'postman' && '.json files (Postman v2.1)'}
                  </p>
                </div>

                <div>
                  <Label>Or paste content</Label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={
                      importType === 'curl'
                        ? "curl -X GET 'https://api.example.com/users'"
                        : 'Paste JSON content here...'
                    }
                    className="mt-1 font-mono text-xs"
                    rows={10}
                  />
                </div>

                <Button
                  onClick={handleParse}
                  disabled={!content.trim() || parseImport.isPending}
                  className="w-full"
                >
                  {parseImport.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Parse
                </Button>
              </CardContent>
            </Card>

            {/* Right: Preview & Import */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview</CardTitle>
                <CardDescription>
                  {parseResult
                    ? `${parseResult.flows.length} flows parsed`
                    : 'Parse content to preview flows'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {parseResult?.warnings && parseResult.warnings.length > 0 && (
                  <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900">
                    <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-400">
                      <AlertCircle className="w-4 h-4" />
                      {parseResult.warnings.length} warning(s)
                    </div>
                    <ul className="mt-2 text-xs text-yellow-700 dark:text-yellow-500 space-y-1">
                      {parseResult.warnings.slice(0, 3).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                      {parseResult.warnings.length > 3 && (
                        <li>...and {parseResult.warnings.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {parseResult && parseResult.flows.length > 0 && (
                  <>
                    <div className="border rounded-md overflow-auto max-h-64">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={selectedFlows.size === parseResult.flows.length}
                                onCheckedChange={toggleAll}
                              />
                            </TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="w-20">Steps</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parseResult.flows.map((flow, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedFlows.has(i)}
                                  onCheckedChange={() => toggleFlow(i)}
                                />
                              </TableCell>
                              <TableCell>
                                <input
                                  type="text"
                                  value={flowNames[i] ?? flow.name}
                                  onChange={(e) =>
                                    setFlowNames((prev) => ({ ...prev, [i]: e.target.value }))
                                  }
                                  className="w-full bg-transparent text-sm font-medium border-0 border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-0 py-0.5"
                                />
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{flow.steps?.length || 0}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="space-y-3">
                      {groupRequests && (
                        <div>
                          <Label className="text-sm">Flow name</Label>
                          <Input
                            value={groupedFlowName}
                            onChange={(e) => setGroupedFlowName(e.target.value)}
                            placeholder="Grouped flow name"
                            className="mt-1"
                          />
                        </div>
                      )}
                      <div>
                        <Label className="text-sm">Suite</Label>
                        <Input
                          value={suite}
                          onChange={(e) => setSuite(e.target.value)}
                          placeholder="Optional suite name"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Tags (comma-separated)</Label>
                        <Input
                          value={tags}
                          onChange={(e) => setTags(e.target.value)}
                          placeholder="imported, api"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Collection</Label>
                        <Select value={collectionId} onValueChange={setCollectionId}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="No collection" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No collection</SelectItem>
                            {collectionsData?.collections.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {importErrors.length > 0 && (
                      <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                        <div className="flex items-center gap-2 text-sm text-red-800 dark:text-red-400">
                          <AlertCircle className="w-4 h-4" />
                          {importErrors.length} error(s) during import
                        </div>
                        <ul className="mt-2 text-xs text-red-700 dark:text-red-500 space-y-1">
                          {importErrors.slice(0, 3).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                          {importErrors.length > 3 && (
                            <li>...and {importErrors.length - 3} more</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {importSuccess ? (
                      <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-700 dark:text-green-400">
                          Successfully imported {importedCount} flow(s)
                        </span>
                      </div>
                    ) : (
                      <Button
                        onClick={handleImport}
                        disabled={selectedFlows.size === 0 || importFlows.isPending}
                        className="w-full"
                      >
                        {importFlows.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {groupRequests && selectedFlows.size > 1
                          ? `Import as 1 Flow (${selectedFlows.size} steps)`
                          : `Import ${selectedFlows.size} Flow(s)`}
                      </Button>
                    )}
                  </>
                )}

                {!parseResult && (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileJson className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Parse content to see preview</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {parseResult && (
            <Card className="mt-6">
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">{parseResult.stats.total_requests}</div>
                    <div className="text-sm text-muted-foreground">Total Requests</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {parseResult.stats.successful_flows}
                    </div>
                    <div className="text-sm text-muted-foreground">Converted to Flows</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {parseResult.stats.skipped_requests}
                    </div>
                    <div className="text-sm text-muted-foreground">Skipped</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── FROM SPEC (AI) ── */}
        <TabsContent value="spec" className="mt-4">
          {!aiResult ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Generate flows from API specification
                </CardTitle>
                <CardDescription>
                  AI analyzes your spec and generates test flows with assertions automatically
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={specType} onValueChange={setSpecType}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="openapi">OpenAPI / Swagger</TabsTrigger>
                    <TabsTrigger value="postman">Postman Collection</TabsTrigger>
                  </TabsList>
                  <TabsContent value="openapi">
                    <p className="text-sm text-muted-foreground mt-2">
                      Import OpenAPI 3.0 or Swagger 2.0 — generates flows for each endpoint with smart assertions.
                    </p>
                  </TabsContent>
                  <TabsContent value="postman">
                    <p className="text-sm text-muted-foreground mt-2">
                      Import a Postman collection spec to generate AI-enriched test flows with assertions.
                    </p>
                  </TabsContent>
                </Tabs>

                <div className="space-y-2">
                  <Label>Specification content</Label>
                  <Textarea
                    placeholder={getSpecPlaceholder()}
                    value={spec}
                    onChange={(e) => setSpec(e.target.value)}
                    className="min-h-64 font-mono text-xs"
                    disabled={isAiLoading}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="createFlows"
                    checked={createFlows}
                    onCheckedChange={(checked) => setCreateFlows(checked as boolean)}
                  />
                  <Label htmlFor="createFlows" className="text-sm">
                    Automatically save flows to the database
                  </Label>
                </div>

                <Button
                  onClick={handleAiImport}
                  disabled={!spec.trim() || isAiLoading}
                  className="w-full"
                >
                  {isAiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating flows...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Flows
                    </>
                  )}
                </Button>

                {(importOpenAPI.isError || importPostman.isError) && (
                  <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                    <div className="flex items-center gap-2 text-sm text-red-800 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      Generation failed
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-500 mt-1">
                      {(() => {
                        const err = importOpenAPI.error || importPostman.error;
                        return err instanceof Error ? err.message : 'An unknown error occurred';
                      })()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-500" />
                    {aiResult.flows_generated} flow{aiResult.flows_generated !== 1 ? 's' : ''} generated
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {aiResult.detected_base_url && aiResult.service_var_name && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Set environment variable</AlertTitle>
                      <AlertDescription>
                        Generated flows use{' '}
                        <code className="font-mono bg-muted px-1 py-0.5 rounded text-sm">
                          {`{{${aiResult.service_var_name}}}`}
                        </code>{' '}
                        as the base URL. Add this to your environment with value{' '}
                        <code className="font-mono bg-muted px-1 py-0.5 rounded text-sm">
                          {aiResult.detected_base_url}
                        </code>
                        .
                      </AlertDescription>
                    </Alert>
                  )}

                  {aiResult.flows && aiResult.flows.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Generated flows</h3>
                      <div className="border rounded-md overflow-hidden">
                        {aiResult.flows.map((flow) => (
                          <Link
                            key={flow.id}
                            href={`/flows/${flow.id}`}
                            className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                          >
                            <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{flow.name}</div>
                              {flow.description && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {flow.description}
                                </div>
                              )}
                            </div>
                            <Badge variant="secondary">
                              {flow.definition?.steps?.length || 0} steps
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Link href="/flows">
                      <Button>View All Flows</Button>
                    </Link>
                    <Button variant="outline" onClick={() => { setAiResult(null); setSpec(''); }}>
                      Import More
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
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
