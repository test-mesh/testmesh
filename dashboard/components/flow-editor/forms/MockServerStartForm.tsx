'use client';

import { Server, Play, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import MockServerConfigPanel, { type MockServerConfig } from './MockServerConfigPanel';

interface MockServerStartFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function MockServerStartForm({
  config,
  onChange,
  className,
}: MockServerStartFormProps) {
  const mockConfig: MockServerConfig = (config as unknown as MockServerConfig) || {
    name: 'mock_server',
    port: 8080,
    endpoints: [],
    enable_cors: true,
    enable_logging: true,
  };

  const handleConfigChange = (newConfig: MockServerConfig) => {
    // Update all config keys
    Object.keys(newConfig).forEach((key) => {
      onChange(key, (newConfig as any)[key]);
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Server className="h-4 w-4 text-pink-500" />
        <span className="text-sm font-medium">Start Mock Server</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 mt-0.5" />
          <div className="text-sm text-blue-900 dark:text-blue-300">
            <p className="font-medium mb-1">Mock Server Features:</p>
            <ul className="text-xs space-y-0.5 ml-4 list-disc">
              <li>Define multiple REST API endpoints</li>
              <li>Stateful responses with state management</li>
              <li>Request matching with patterns and conditions</li>
              <li>Configurable delays and response codes</li>
              <li>Request recording and verification</li>
            </ul>
          </div>
        </div>
      </div>

      <MockServerConfigPanel
        config={mockConfig}
        onChange={handleConfigChange}
      />

      {/* Quick Start Guide */}
      <details className="space-y-2 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
          <Play className="w-4 h-4" />
          Quick Start Guide
        </summary>
        <div className="pt-2 space-y-3 text-xs">
          <div>
            <p className="font-medium mb-1">1. Add Endpoints</p>
            <p className="text-muted-foreground">
              Click "Add Endpoint" to create mock API routes. Define the path, method, and
              response.
            </p>
          </div>
          <div>
            <p className="font-medium mb-1">2. Configure Responses</p>
            <p className="text-muted-foreground">
              Set status codes, response bodies, and optional delays. Use templates for common
              responses.
            </p>
          </div>
          <div>
            <p className="font-medium mb-1">3. Add State (Optional)</p>
            <p className="text-muted-foreground">
              Enable state management to track data across requests (e.g., counters, user
              sessions).
            </p>
          </div>
          <div>
            <p className="font-medium mb-1">4. Test Your API</p>
            <p className="text-muted-foreground">
              Use HTTP request steps to call your mock server at{' '}
              <code className="font-mono">http://localhost:PORT/path</code>
            </p>
          </div>
        </div>
      </details>

      {/* Usage in Flow */}
      <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Server className="h-4 w-4" />
          Server Access
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>
            Server will be available at:{' '}
            <code className="font-mono bg-background px-1 rounded">
              http://localhost:{mockConfig.port || 8080}
              {mockConfig.base_path || ''}
            </code>
          </div>
          <div className="text-[10px]">
            Reference in HTTP requests: <code className="font-mono">{'${mock_server_url}'}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
