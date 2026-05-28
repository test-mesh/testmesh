'use client';

import { useState } from 'react';
import { Copy, CheckCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016';

function CodeBlock({ code, language = 'yaml' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-[#1e2d3d] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332] bg-[#0b0f18]">
        <span className="text-[10px] text-[#4a6480] font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 h-6 px-2 rounded text-[10px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          {copied ? (
            <><CheckCircle className="w-3 h-3 text-teal-400" />Copied</>
          ) : (
            <><Copy className="w-3 h-3" />Copy</>
          )}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-x-auto whitespace-pre text-[#c8dce8] bg-[#0f1923]">{code}</pre>
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

type CICDTab = 'github' | 'gitlab' | 'jenkins' | 'curl';

export function CICDIntegrationSection() {
  const [tab, setTab] = useState<CICDTab>('github');

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
        <div className="p-5 border-b border-[#1a2332]">
          <p className="text-sm font-semibold text-[#c8dce8]">API-Based CI/CD Triggering</p>
          <p className="text-xs text-[#4a6480] mt-0.5">
            Use the TestMesh REST API to trigger test runs from any CI/CD pipeline. Generate an API key
            in Settings → Plugins, then use it in your pipeline scripts.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {['GitHub Actions', 'GitLab CI', 'Jenkins', 'CircleCI', 'Bitbucket Pipelines', 'Any REST client'].map(p => (
              <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">{p}</span>
            ))}
          </div>
          <div className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3 space-y-1">
            <div className="text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">API Base URL</div>
            <code className="text-sm font-mono text-teal-400">{API_URL}/api/v1</code>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
        <div className="p-5 border-b border-[#1a2332]">
          <p className="text-sm font-semibold text-[#c8dce8]">Pipeline Examples</p>
          <p className="text-xs text-[#4a6480] mt-0.5">
            Copy these snippets into your CI/CD configuration. Replace{' '}
            <code className="text-[11px] font-mono px-1 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">YOUR_API_KEY</code> and{' '}
            <code className="text-[11px] font-mono px-1 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">your-suite-id</code> with
            your actual values.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-0.5 border-b border-[#1a2332] pb-3">
            {([
              ['github', 'GitHub Actions'],
              ['gitlab', 'GitLab CI'],
              ['jenkins', 'Jenkins'],
              ['curl', 'REST API'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`h-7 px-3 rounded text-xs transition-colors ${
                  tab === id
                    ? 'bg-[#1a2332] text-[#c8dce8]'
                    : 'text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#131b26]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'github' && (
            <div className="space-y-2">
              <CodeBlock code={GITHUB_ACTIONS_YAML} language=".github/workflows/testmesh.yml" />
              <p className="text-xs text-[#4a6480]">
                Add <code className="px-1 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">TESTMESH_API_KEY</code> as a repository secret in GitHub → Settings → Secrets and variables → Actions.
              </p>
            </div>
          )}
          {tab === 'gitlab' && (
            <div className="space-y-2">
              <CodeBlock code={GITLAB_CI_YAML} language=".gitlab-ci.yml" />
              <p className="text-xs text-[#4a6480]">
                Add <code className="px-1 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">TESTMESH_API_KEY</code> as a CI/CD variable in GitLab → Settings → CI/CD → Variables.
              </p>
            </div>
          )}
          {tab === 'jenkins' && (
            <div className="space-y-2">
              <CodeBlock code={JENKINS_GROOVY} language="Jenkinsfile" />
              <p className="text-xs text-[#4a6480]">
                Store the API key as a Jenkins credential and inject via{' '}
                <code className="px-1 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">withCredentials</code> or environment variables.
              </p>
            </div>
          )}
          {tab === 'curl' && (
            <CodeBlock code={CURL_EXAMPLE} language="bash" />
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
        <div className="p-5 border-b border-[#1a2332]">
          <p className="text-sm font-semibold text-[#c8dce8]">JUnit Report Export</p>
          <p className="text-xs text-[#4a6480] mt-0.5">
            Export execution results as JUnit XML for test reporting in your CI/CD dashboard.
          </p>
        </div>
        <div className="p-5 space-y-2">
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
          <p className="text-xs text-[#4a6480]">
            Use the <code className="px-1 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">Analytics → Export</code> tab for interactive report generation,
            or the API for automated pipeline exports.
          </p>
        </div>
      </div>
    </div>
  );
}
