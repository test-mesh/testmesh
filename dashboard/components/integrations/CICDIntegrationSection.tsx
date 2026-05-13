'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, CheckCircle, ExternalLink } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016';

function CodeBlock({ code, language = 'yaml' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg border bg-muted/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/80">
        <span className="text-xs text-muted-foreground font-mono">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={handleCopy}
        >
          {copied ? (
            <><CheckCircle className="w-3 h-3 text-green-500" />Copied</>
          ) : (
            <><Copy className="w-3 h-3" />Copy</>
          )}
        </Button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-x-auto whitespace-pre text-foreground">{code}</pre>
    </div>
  );
}

const GITHUB_ACTIONS_YAML = `name: Run TestMesh on Deploy

on:
  push:
    branches: [main]
  pull_request:

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger TestMesh Suite
        run: |
          curl -X POST ${API_URL}/api/v1/suites/\\${{ env.SUITE_ID }}/run \\
            -H "Authorization: Bearer \\${{ secrets.TESTMESH_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"environment": "staging"}'
        env:
          SUITE_ID: your-suite-id`;

const GITLAB_CI_YAML = `stages:
  - test

testmesh:
  stage: test
  script:
    - |
      curl -X POST ${API_URL}/api/v1/suites/\${SUITE_ID}/run \\
        -H "Authorization: Bearer \${TESTMESH_API_KEY}" \\
        -H "Content-Type: application/json" \\
        -d '{"environment": "staging"}'
  variables:
    SUITE_ID: your-suite-id`;

const JENKINS_GROOVY = `pipeline {
  agent any
  stages {
    stage('Integration Tests') {
      steps {
        sh """
          curl -X POST ${API_URL}/api/v1/suites/\\${SUITE_ID}/run \\
            -H "Authorization: Bearer \\${TESTMESH_API_KEY}" \\
            -H "Content-Type: application/json" \\
            -d '{"environment": "staging"}'
        """
      }
    }
  }
}`;

const CURL_EXAMPLE = `# Run a specific flow
curl -X POST ${API_URL}/api/v1/executions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"flow_id": "your-flow-id", "environment": "staging"}'

# Run a suite
curl -X POST ${API_URL}/api/v1/suites/YOUR_SUITE_ID/run \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"environment": "staging"}'

# Check execution status
curl ${API_URL}/api/v1/executions/EXECUTION_ID \\
  -H "Authorization: Bearer YOUR_API_KEY"`;

export function CICDIntegrationSection() {
  return (
    <div className="space-y-6">
      {/* Overview card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API-Based CI/CD Triggering</CardTitle>
          <CardDescription>
            Use the TestMesh REST API to trigger test runs from any CI/CD pipeline. Generate an API key
            in Settings → Plugins, then use it in your pipeline scripts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">GitHub Actions</Badge>
            <Badge variant="secondary">GitLab CI</Badge>
            <Badge variant="secondary">Jenkins</Badge>
            <Badge variant="secondary">CircleCI</Badge>
            <Badge variant="secondary">Bitbucket Pipelines</Badge>
            <Badge variant="secondary">Any REST client</Badge>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">API Base URL</div>
            <code className="text-sm font-mono text-primary">{API_URL}/api/v1</code>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline examples */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline Examples</CardTitle>
          <CardDescription>
            Copy these snippets into your CI/CD configuration. Replace{' '}
            <code className="text-xs font-mono bg-muted px-1 rounded">YOUR_API_KEY</code> and{' '}
            <code className="text-xs font-mono bg-muted px-1 rounded">your-suite-id</code> with
            your actual values.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="github" className="space-y-4">
            <TabsList>
              <TabsTrigger value="github" className="text-xs">GitHub Actions</TabsTrigger>
              <TabsTrigger value="gitlab" className="text-xs">GitLab CI</TabsTrigger>
              <TabsTrigger value="jenkins" className="text-xs">Jenkins</TabsTrigger>
              <TabsTrigger value="curl" className="text-xs">REST API</TabsTrigger>
            </TabsList>

            <TabsContent value="github">
              <CodeBlock code={GITHUB_ACTIONS_YAML} language=".github/workflows/testmesh.yml" />
              <p className="text-xs text-muted-foreground mt-2">
                Add <code className="bg-muted px-1 rounded">TESTMESH_API_KEY</code> as a repository secret in GitHub → Settings → Secrets and variables → Actions.
              </p>
            </TabsContent>

            <TabsContent value="gitlab">
              <CodeBlock code={GITLAB_CI_YAML} language=".gitlab-ci.yml" />
              <p className="text-xs text-muted-foreground mt-2">
                Add <code className="bg-muted px-1 rounded">TESTMESH_API_KEY</code> as a CI/CD variable in GitLab → Settings → CI/CD → Variables.
              </p>
            </TabsContent>

            <TabsContent value="jenkins">
              <CodeBlock code={JENKINS_GROOVY} language="Jenkinsfile" />
              <p className="text-xs text-muted-foreground mt-2">
                Store the API key as a Jenkins credential and inject via{' '}
                <code className="bg-muted px-1 rounded">withCredentials</code> or environment variables.
              </p>
            </TabsContent>

            <TabsContent value="curl">
              <CodeBlock code={CURL_EXAMPLE} language="bash" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* JUnit export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">JUnit Report Export</CardTitle>
          <CardDescription>
            Export execution results as JUnit XML for test reporting in your CI/CD dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            code={`# Export execution results as JUnit XML
curl "${API_URL}/api/v1/reports" \\
  -X POST \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "CI Run $(date +%F)",
    "format": "junit",
    "start_date": "'"$(date -v-1d +%Y-%m-%d)"'",
    "end_date": "'"$(date +%Y-%m-%d)"'"
  }'`}
            language="bash"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Use the <code className="bg-muted px-1 rounded">Analytics → Export</code> tab for interactive report generation,
            or the API for automated pipeline exports.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
