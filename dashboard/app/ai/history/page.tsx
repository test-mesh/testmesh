'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useGenerationHistory,
  useImportHistory,
  useCoverageAnalyses,
} from '@/lib/hooks/useAI';
import {
  ArrowLeft,
  Sparkles,
  FileUp,
  Target,
  RefreshCw,
  Clock,
  History,
  ArrowRight,
} from 'lucide-react';
import type { GenerationHistory, ImportHistory, CoverageAnalysis } from '@/lib/api/types';

export default function AIHistoryPage() {
  const [activeTab, setActiveTab] = useState('generations');

  const { data: generationsData, isLoading: generationsLoading } = useGenerationHistory({ limit: 50 });
  const { data: importsData, isLoading: importsLoading } = useImportHistory({ limit: 50 });
  const { data: coverageData, isLoading: coverageLoading } = useCoverageAnalyses({ limit: 50 });

  const generations = generationsData?.history || [];
  const imports = importsData?.history || [];
  const coverageAnalyses = coverageData?.analyses || [];

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default">Completed</Badge>;
      case 'processing':
      case 'analyzing':
        return <Badge variant="secondary">Processing</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const isLoading = generationsLoading || importsLoading || coverageLoading;

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/ai">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to AI Hub
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="h-8 w-8" />
            AI History
          </h1>
          <p className="text-muted-foreground mt-1">
            Browse history of AI-powered generations, imports, and analyses
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab('generations')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Generations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{generations.length}</div>
            <p className="text-xs text-muted-foreground">AI-generated flows</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab('imports')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileUp className="h-4 w-4 text-blue-500" />
              Imports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{imports.length}</div>
            <p className="text-xs text-muted-foreground">Spec imports (OpenAPI, Postman, Pact)</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab('coverage')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-green-500" />
              Coverage Analyses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coverageAnalyses.length}</div>
            <p className="text-xs text-muted-foreground">Coverage reports</p>
          </CardContent>
        </Card>
      </div>

      {/* History Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="generations" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Generations
          </TabsTrigger>
          <TabsTrigger value="imports" className="flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            Imports
          </TabsTrigger>
          <TabsTrigger value="coverage" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Coverage
          </TabsTrigger>
        </TabsList>

        {/* Generations Tab */}
        <TabsContent value="generations">
          <Card>
            <CardHeader>
              <CardTitle>Generation History</CardTitle>
              <CardDescription>
                AI-generated flows from natural language prompts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {generationsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : generations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mb-4" />
                  <p>No generation history yet</p>
                  <Link href="/ai/generate">
                    <Button variant="outline" className="mt-4">
                      Generate a Flow
                    </Button>
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Prompt</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {generations.map((gen: GenerationHistory) => (
                      <TableRow key={gen.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(gen.created_at)}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <span className="line-clamp-2" title={gen.prompt}>
                            {truncateText(gen.prompt, 100)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {gen.provider}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(gen.status)}</TableCell>
                        <TableCell>{gen.tokens_used.toLocaleString()}</TableCell>
                        <TableCell>{(gen.latency_ms / 1000).toFixed(2)}s</TableCell>
                        <TableCell>
                          <Link href={`/ai/history/generation/${gen.id}`}>
                            <Button variant="ghost" size="sm">
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Imports Tab */}
        <TabsContent value="imports">
          <Card>
            <CardHeader>
              <CardTitle>Import History</CardTitle>
              <CardDescription>
                Flows generated from OpenAPI, Postman, and Pact imports
              </CardDescription>
            </CardHeader>
            <CardContent>
              {importsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : imports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileUp className="h-12 w-12 mb-4" />
                  <p>No import history yet</p>
                  <Link href="/ai/import">
                    <Button variant="outline" className="mt-4">
                      Import a Spec
                    </Button>
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Flows Generated</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {imports.map((imp: ImportHistory) => (
                      <TableRow key={imp.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(imp.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {imp.source_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {imp.source_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(imp.status)}</TableCell>
                        <TableCell>
                          <span className="font-medium">{imp.flows_generated}</span>
                        </TableCell>
                        <TableCell>
                          <Link href={`/ai/history/import/${imp.id}`}>
                            <Button variant="ghost" size="sm">
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Coverage Tab */}
        <TabsContent value="coverage">
          <Card>
            <CardHeader>
              <CardTitle>Coverage Analysis History</CardTitle>
              <CardDescription>
                API coverage analyses comparing flows against specifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              {coverageLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : coverageAnalyses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Target className="h-12 w-12 mb-4" />
                  <p>No coverage analyses yet</p>
                  <Link href="/ai/coverage">
                    <Button variant="outline" className="mt-4">
                      Analyze Coverage
                    </Button>
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Spec Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Coverage</TableHead>
                      <TableHead>Endpoints</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coverageAnalyses.map((analysis: CoverageAnalysis) => (
                      <TableRow key={analysis.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(analysis.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {analysis.spec_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {analysis.spec_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(analysis.status)}</TableCell>
                        <TableCell>
                          <span className={`font-medium ${
                            analysis.coverage_percent >= 80 ? 'text-green-600' :
                            analysis.coverage_percent >= 50 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {analysis.coverage_percent.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-green-600">{analysis.covered_endpoints}</span>
                          {' / '}
                          <span>{analysis.total_endpoints}</span>
                        </TableCell>
                        <TableCell>
                          <Link href={`/ai/history/coverage/${analysis.id}`}>
                            <Button variant="ghost" size="sm">
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
