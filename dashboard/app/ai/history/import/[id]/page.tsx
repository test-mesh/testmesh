'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useImportHistoryDetail } from '@/lib/hooks/useAI';
import {
  ArrowLeft,
  FileUp,
  RefreshCw,
  FileCode,
  ExternalLink,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ImportDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: importData, isLoading, error } = useImportHistoryDetail(id);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default">Completed</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'openapi':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">OpenAPI</Badge>;
      case 'postman':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Postman</Badge>;
      case 'pact':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Pact</Badge>;
      default:
        return <Badge variant="outline">{sourceType}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !importData) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/ai/history">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to History
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileUp className="h-12 w-12 mb-4" />
            <p>Import record not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/ai/history">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to History
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileUp className="h-8 w-8 text-blue-500" />
            Import Details
          </h1>
          <p className="text-muted-foreground mt-1">
            Imported on {formatDate(importData.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(importData.status)}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-medium text-lg">{importData.source_name}</div>
            <div className="mt-2">{getSourceIcon(importData.source_type)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Flows Generated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{importData.flows_generated}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {importData.status === 'completed' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : importData.status === 'failed' ? (
                <AlertCircle className="h-5 w-5 text-red-500" />
              ) : (
                <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
              )}
              <span className="capitalize">{importData.status}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generated Flows */}
      {importData.flow_ids && importData.flow_ids.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Generated Flows</CardTitle>
            <CardDescription>
              {importData.flows_generated} flow(s) were created from this import
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flow ID</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importData.flow_ids.map((flowId: string) => (
                  <TableRow key={flowId}>
                    <TableCell className="font-mono">{flowId}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/flows/${flowId}`}>
                        <Button variant="ghost" size="sm">
                          View Flow <ExternalLink className="h-4 w-4 ml-2" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Re-import Action */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Link href="/ai/import">
            <Button variant="outline">
              <FileUp className="h-4 w-4 mr-2" />
              Import Another Spec
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Error */}
      {importData.error && (
        <Card className="mt-6 border-red-200 bg-red-50/50 dark:bg-red-950/20">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{importData.error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
