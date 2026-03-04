'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useGenerationHistoryDetail, useGenerateFlow } from '@/lib/hooks/useAI';
import {
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Clock,
  Zap,
  FileText,
  Copy,
  Check,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function GenerationDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: generation, isLoading, error } = useGenerationHistoryDetail(id);
  const regenerate = useGenerateFlow();
  const [copied, setCopied] = useState(false);

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

  const handleCopyYaml = () => {
    if (generation?.generated_yaml) {
      navigator.clipboard.writeText(generation.generated_yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerate = () => {
    if (generation) {
      regenerate.mutate({
        prompt: generation.prompt,
        provider: generation.provider,
        model: generation.model,
      });
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

  if (error || !generation) {
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
            <Sparkles className="h-12 w-12 mb-4" />
            <p>Generation not found</p>
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
            <Sparkles className="h-8 w-8 text-purple-500" />
            Generation Details
          </h1>
          <p className="text-muted-foreground mt-1">
            Generated on {formatDate(generation.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(generation.status)}
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={regenerate.isPending}
          >
            {regenerate.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Regenerate
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Provider</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="capitalize text-lg">
              {generation.provider}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">{generation.model}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Tokens Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{generation.tokens_used.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(generation.latency_ms / 1000).toFixed(2)}s</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Flow Created</CardTitle>
          </CardHeader>
          <CardContent>
            {generation.flow_id ? (
              <Link href={`/flows/${generation.flow_id}`} className="flex items-center gap-2 text-primary hover:underline">
                View Flow <ExternalLink className="h-4 w-4" />
              </Link>
            ) : (
              <span className="text-muted-foreground">Not saved</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Prompt */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Prompt
          </CardTitle>
          <CardDescription>The natural language description used to generate this flow</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="whitespace-pre-wrap">{generation.prompt}</p>
          </div>
        </CardContent>
      </Card>

      {/* Generated YAML */}
      {generation.generated_yaml && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Generated YAML</CardTitle>
                <CardDescription>The flow definition generated by AI</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleCopyYaml}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy YAML
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted/50 rounded-lg p-4 overflow-x-auto text-sm">
              <code>{generation.generated_yaml}</code>
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {generation.error && (
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{generation.error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
