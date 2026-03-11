'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plug, Bot, GitBranch, Bell } from 'lucide-react';
import { AIProviderSection } from '@/components/integrations/AIProviderSection';
import { GitIntegrationSection } from '@/components/integrations/GitIntegrationSection';
import { GiteaIntegrationSection } from '@/components/integrations/GiteaIntegrationSection';
import { SlackIntegrationSection } from '@/components/integrations/SlackIntegrationSection';

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState('ai-providers');

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
          <Card>
            <CardHeader>
              <CardTitle>AI Providers</CardTitle>
              <CardDescription>
                Configure AI providers for test generation, failure analysis, and self-healing.
                TestMesh supports OpenAI, Anthropic Claude, and local LLM endpoints.
              </CardDescription>
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
