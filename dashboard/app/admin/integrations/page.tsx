'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plug, Bot, GitBranch, Bell, History } from 'lucide-react';
import { AIProviderSection } from '@/components/integrations/AIProviderSection';
import { GitIntegrationSection } from '@/components/integrations/GitIntegrationSection';
import { GiteaIntegrationSection } from '@/components/integrations/GiteaIntegrationSection';
import { SlackIntegrationSection } from '@/components/integrations/SlackIntegrationSection';
import { useAIUsage } from '@/lib/hooks/useAI';

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState('ai-providers');
  const { data: usageData } = useAIUsage();

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Plug className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
          <p className="text-muted-foreground">
            Manage AI providers, Git webhooks, and notification channels
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="ai-providers" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Providers
          </TabsTrigger>
          <TabsTrigger value="git-integration" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            GitHub
          </TabsTrigger>
          <TabsTrigger value="gitea-integration" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Gitea
          </TabsTrigger>
          <TabsTrigger value="slack" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Slack
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-providers" className="space-y-6">
          {usageData && usageData.stats.length > 0 && (
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Requests</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{usageData.stats.reduce((a, s) => a + s.total_requests, 0)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Tokens Used</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{usageData.stats.reduce((a, s) => a + s.total_tokens, 0).toLocaleString()}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Success Rate</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {(() => {
                      const total = usageData.stats.reduce((a, s) => a + s.total_requests, 0);
                      const success = usageData.stats.reduce((a, s) => a + s.success_count, 0);
                      return total > 0 ? `${Math.round((success / total) * 100)}%` : 'N/A';
                    })()}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Avg Latency</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(() => {
                      const stats = usageData.stats.filter(s => s.avg_latency_ms > 0);
                      if (!stats.length) return 'N/A';
                      return `${(stats.reduce((a, s) => a + s.avg_latency_ms, 0) / stats.length / 1000).toFixed(1)}s`;
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>AI Providers</CardTitle>
                  <CardDescription>
                    Configure AI providers for test generation, failure analysis, and self-healing.
                    TestMesh supports OpenAI, Anthropic Claude, and local LLM endpoints.
                  </CardDescription>
                </div>
                <Link href="/ai/history">
                  <Button variant="outline" size="sm">
                    <History className="h-4 w-4 mr-2" />
                    View History
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <AIProviderSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="git-integration" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>GitHub Integration</CardTitle>
              <CardDescription>
                Set up webhooks to automatically trigger tests on commits, pull requests, and other Git events.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GitIntegrationSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gitea-integration" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gitea Integration</CardTitle>
              <CardDescription>
                Set up webhooks for self-hosted or cloud Gitea instances to trigger tests automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GiteaIntegrationSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slack" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Slack Notifications</CardTitle>
              <CardDescription>
                Receive execution results and system alerts in your Slack workspace via Incoming Webhooks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SlackIntegrationSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
