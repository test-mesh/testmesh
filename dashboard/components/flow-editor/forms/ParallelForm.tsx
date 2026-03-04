'use client';

import { GitMerge, PlayCircle, Zap } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface ParallelFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function ParallelForm({
  config,
  onChange,
  className,
}: ParallelFormProps) {
  const maxConcurrent = (config.max_concurrent as number) || 0;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <GitMerge className="h-4 w-4 text-cyan-500" />
        <span className="text-sm font-medium">Parallel Execution</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Execute multiple steps concurrently. Useful for loading data from multiple sources simultaneously.
        </p>
      </div>

      {/* Wait for All */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Wait for All</Label>
          <p className="text-xs text-muted-foreground">
            Wait for all parallel steps to complete before continuing
          </p>
        </div>
        <Switch
          checked={(config.wait_for_all as boolean) ?? true}
          onCheckedChange={(checked) => onChange('wait_for_all', checked)}
        />
      </div>

      {/* Fail Fast */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Fail Fast</Label>
          <p className="text-xs text-muted-foreground">
            Stop all parallel execution if any step fails
          </p>
        </div>
        <Switch
          checked={(config.fail_fast as boolean) ?? false}
          onCheckedChange={(checked) => onChange('fail_fast', checked)}
        />
      </div>

      {/* Max Concurrent */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Max Concurrent Steps</Label>
          <span className="text-sm font-medium">
            {maxConcurrent === 0 ? 'Unlimited' : maxConcurrent}
          </span>
        </div>
        <Slider
          value={[maxConcurrent]}
          onValueChange={(v) => onChange('max_concurrent', v[0])}
          min={0}
          max={20}
          step={1}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Limit concurrent execution. 0 = unlimited. Useful for rate limiting.
        </p>
      </div>

      {/* Steps to Execute */}
      <div className="space-y-2">
        <Label>Parallel Steps</Label>
        <div className="p-3 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PlayCircle className="h-4 w-4" />
            <span>Configure parallel steps in the visual editor</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Drag multiple steps into this parallel container. They will execute concurrently.
          </p>
        </div>
      </div>

      {/* Output Access */}
      <div className="space-y-2">
        <Label>Accessing Outputs</Label>
        <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
          <p className="text-xs text-muted-foreground">
            Access outputs from parallel steps using their step IDs:
          </p>
          <div className="space-y-1 text-xs font-mono">
            <div>• ${'{parallel_node.step1.output}'}</div>
            <div>• ${'{parallel_node.step2.output}'}</div>
            <div>• ${'{parallel_node.step3.output}'}</div>
          </div>
        </div>
      </div>

      {/* Performance Tip */}
      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
        <div className="flex items-start gap-2">
          <Zap className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-amber-900 dark:text-amber-300 mb-1">
              Performance Tip
            </p>
            <p className="text-amber-700 dark:text-amber-400">
              Use parallel execution to drastically reduce test execution time when steps don't depend on each other.
              Example: Loading user data, orders, and settings simultaneously instead of sequentially.
            </p>
          </div>
        </div>
      </div>

      {/* Examples */}
      <details className="space-y-2 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Example Use Cases
        </summary>
        <div className="pt-2 space-y-3 text-xs">
          <div>
            <p className="font-medium mb-1">1. Dashboard Data Loading</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Parallel:</div>
              <div className="pl-4">• GET /users/me</div>
              <div className="pl-4">• GET /orders?recent=true</div>
              <div className="pl-4">• GET /notifications?unread=true</div>
              <div>Time saved: 3x faster than sequential</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">2. Multi-Service Healthcheck</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Parallel:</div>
              <div className="pl-4">• GET api-service/health</div>
              <div className="pl-4">• GET database/health</div>
              <div className="pl-4">• GET cache/health</div>
              <div>Assert: All return 200 OK</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">3. Concurrent User Actions</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Parallel (max_concurrent: 5):</div>
              <div className="pl-4">• Create 10 users simultaneously</div>
              <div className="pl-4">• Test system under concurrent load</div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
