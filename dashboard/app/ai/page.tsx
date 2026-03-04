'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAIProviders, useAIUsage } from '@/lib/hooks/useAI';
import {
  Sparkles,
  FileUp,
  Target,
  Lightbulb,
  ArrowRight,
  Zap,
  BarChart3,
  History,
} from 'lucide-react';

export default function AIPage() {
  const { data: providersData } = useAIProviders();
  const { data: usageData } = useAIUsage();

  const providers = providersData?.providers || [];
  const hasConfiguredProvider = providers.length > 0;

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8" />
            AI Features
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered test generation, analysis, and self-healing
          </p>
        </div>
        <div className="flex items-center gap-2">
          {providers.map((provider) => (
            <Badge key={provider} variant="outline" className="capitalize">
              {provider}
            </Badge>
          ))}
          {!hasConfiguredProvider && (
            <Badge variant="destructive">No providers configured</Badge>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      {usageData && usageData.stats.length > 0 && (
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {usageData.stats.reduce((acc, s) => acc + s.total_requests, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {usageData.stats.reduce((acc, s) => acc + s.total_tokens, 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {(() => {
                  const total = usageData.stats.reduce((acc, s) => acc + s.total_requests, 0);
                  const success = usageData.stats.reduce((acc, s) => acc + s.success_count, 0);
                  return total > 0 ? `${Math.round((success / total) * 100)}%` : 'N/A';
                })()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(() => {
                  const stats = usageData.stats.filter((s) => s.avg_latency_ms > 0);
                  if (stats.length === 0) return 'N/A';
                  const avg =
                    stats.reduce((acc, s) => acc + s.avg_latency_ms, 0) / stats.length;
                  return `${(avg / 1000).toFixed(1)}s`;
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Feature Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/ai/generate">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Generate Flows
              </CardTitle>
              <CardDescription>
                Create test flows from natural language descriptions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Describe what you want to test in plain English and let AI generate
                the complete flow YAML for you.
              </p>
              <div className="flex items-center text-sm text-primary">
                Get Started <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/ai/import">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileUp className="h-5 w-5 text-blue-500" />
                Import & Convert
              </CardTitle>
              <CardDescription>
                Convert OpenAPI, Postman, or Pact to test flows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Import your existing API specifications and automatically generate
                comprehensive test flows.
              </p>
              <div className="flex items-center text-sm text-primary">
                Import Specs <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/ai/coverage">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-green-500" />
                Coverage Analysis
              </CardTitle>
              <CardDescription>
                Analyze API coverage and find gaps in your tests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Compare your test flows against OpenAPI specs to identify untested
                endpoints and improve coverage.
              </p>
              <div className="flex items-center text-sm text-primary">
                Analyze Coverage <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/ai/suggestions">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Self-Healing & Suggestions
              </CardTitle>
              <CardDescription>
                AI-powered fixes for failed tests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                When tests fail, AI analyzes the errors and suggests fixes that can
                be applied automatically.
              </p>
              <div className="flex items-center text-sm text-primary">
                View Suggestions <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/ai/history">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-gray-500" />
                History
              </CardTitle>
              <CardDescription>
                Browse AI operation history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                View past generations, imports, and coverage analyses with full
                details and regeneration options.
              </p>
              <div className="flex items-center text-sm text-primary">
                View History <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Provider Info */}
      {!hasConfiguredProvider && (
        <Card className="mt-8 border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardContent className="flex items-start gap-4 pt-6">
            <Zap className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800 dark:text-yellow-200">
                Configure AI Providers
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                To use AI features, configure at least one provider by setting environment variables:
              </p>
              <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-2 list-disc list-inside">
                <li><code>ANTHROPIC_API_KEY</code> for Claude</li>
                <li><code>OPENAI_API_KEY</code> for GPT models</li>
                <li><code>LOCAL_LLM_ENDPOINT</code> for local models (Ollama, vLLM)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
