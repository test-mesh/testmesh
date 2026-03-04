'use client';

import { useState, useCallback } from 'react';
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
import { cn } from '@/lib/utils';
import { useParseImport, useImportFlows } from '@/lib/hooks/useImportExport';
import { useCollections } from '@/lib/hooks/useCollections';
import type { ImportResult, ImportType } from '@/lib/api/import-export';
import type { FlowDefinition } from '@/lib/api/types';

export default function ImportPage() {
  const [importType, setImportType] = useState<ImportType>('har');
  const [content, setContent] = useState('');
  const [parseResult, setParseResult] = useState<ImportResult | null>(null);
  const [selectedFlows, setSelectedFlows] = useState<Set<number>>(new Set());
  const [suite, setSuite] = useState('');
  const [tags, setTags] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);

  const parseImport = useParseImport();
  const importFlows = useImportFlows();
  const { data: collectionsData } = useCollections();

  // Handle file upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setContent(text);

    // Auto-detect type from filename
    if (file.name.endsWith('.har')) {
      setImportType('har');
    } else if (file.name.endsWith('.json')) {
      // Could be HAR or Postman
      try {
        const json = JSON.parse(text);
        if (json.log?.entries) {
          setImportType('har');
        } else if (json.info?.schema?.includes('postman')) {
          setImportType('postman');
        }
      } catch {
        // Not JSON, keep current type
      }
    }
  }, []);

  // Parse content
  const handleParse = async () => {
    if (!content.trim()) return;

    try {
      const result = await parseImport.mutateAsync({ type: importType, content });
      setParseResult(result);
      // Select all flows by default
      setSelectedFlows(new Set(result.flows.map((_, i) => i)));
      setImportSuccess(false);
    } catch (error) {
      console.error('Parse failed:', error);
    }
  };

  // Import selected flows
  const handleImport = async () => {
    if (!parseResult) return;

    const flowsToImport = parseResult.flows.filter((_, i) => selectedFlows.has(i));
    if (flowsToImport.length === 0) return;

    try {
      await importFlows.mutateAsync({
        flows: flowsToImport,
        suite: suite || undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
        collection_id: collectionId || undefined,
      });
      setImportSuccess(true);
    } catch (error) {
      console.error('Import failed:', error);
    }
  };

  // Toggle flow selection
  const toggleFlow = (index: number) => {
    const newSelected = new Set(selectedFlows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedFlows(newSelected);
  };

  // Toggle all
  const toggleAll = () => {
    if (!parseResult) return;
    if (selectedFlows.size === parseResult.flows.length) {
      setSelectedFlows(new Set());
    } else {
      setSelectedFlows(new Set(parseResult.flows.map((_, i) => i)));
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
          Import flows from HAR files, cURL commands, or Postman collections
        </p>
      </div>

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

            {/* File upload */}
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

            {/* Text input */}
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
                          <TableCell className="font-medium text-sm">
                            {flow.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{flow.steps?.length || 0}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Import options */}
                <div className="space-y-3">
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
                        <SelectItem value="">No collection</SelectItem>
                        {collectionsData?.collections.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {importSuccess ? (
                  <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700 dark:text-green-400">
                      Successfully imported {selectedFlows.size} flow(s)
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
                    Import {selectedFlows.size} Flow(s)
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

      {/* Stats */}
      {parseResult && (
        <Card>
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
    </div>
  );
}
