'use client';

import { Clock, PlayCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface WaitUntilFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function WaitUntilForm({
  config,
  onChange,
  className,
}: WaitUntilFormProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Clock className="h-4 w-4 text-fuchsia-500" />
        <span className="text-sm font-medium">Wait Until (Polling)</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Polls nested steps repeatedly until a condition is met or timeout is reached.
        </p>
      </div>

      {/* Condition */}
      <div className="space-y-2">
        <Label htmlFor="condition">Condition Expression</Label>
        <Textarea
          id="condition"
          value={(config.condition as string) || ''}
          onChange={(e) => onChange('condition', e.target.value)}
          placeholder={'${check_status.status} == "completed"'}
          rows={2}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Boolean expression that evaluates to true when condition is met
        </p>
      </div>

      {/* Max Duration */}
      <div className="space-y-2">
        <Label htmlFor="max_duration">Max Duration</Label>
        <Input
          id="max_duration"
          value={(config.max_duration as string) || '5m'}
          onChange={(e) => onChange('max_duration', e.target.value)}
          placeholder="5m"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Maximum time to wait (e.g., 30s, 5m, 1h)
        </p>
      </div>

      {/* Poll Interval */}
      <div className="space-y-2">
        <Label htmlFor="interval">Poll Interval</Label>
        <Input
          id="interval"
          value={(config.interval as string) || '5s'}
          onChange={(e) => onChange('interval', e.target.value)}
          placeholder="5s"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Time between polling attempts (e.g., 1s, 5s, 10s)
        </p>
      </div>

      {/* On Timeout */}
      <div className="space-y-2">
        <Label htmlFor="on_timeout">On Timeout</Label>
        <Select
          value={(config.on_timeout as string) || 'fail'}
          onValueChange={(v) => onChange('on_timeout', v)}
        >
          <SelectTrigger id="on_timeout">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fail">
              <div>
                <div className="font-medium">Fail</div>
                <div className="text-xs text-muted-foreground">
                  Mark step as failed
                </div>
              </div>
            </SelectItem>
            <SelectItem value="continue">
              <div>
                <div className="font-medium">Continue</div>
                <div className="text-xs text-muted-foreground">
                  Continue to next step
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Steps to Execute */}
      <div className="space-y-2">
        <Label>Steps to Poll</Label>
        <div className="p-3 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PlayCircle className="h-4 w-4" />
            <span>Configure nested steps in the visual editor</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            These steps will be executed on each poll interval. Typically contains a check/query step.
          </p>
        </div>
      </div>

      {/* Example */}
      <details className="space-y-2 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Example Use Case
        </summary>
        <div className="pt-2 space-y-2 text-xs">
          <p className="font-medium">Scenario: Wait for job completion</p>
          <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
            <div>1. Start job → returns job_id</div>
            <div>2. Wait Until:</div>
            <div className="pl-4">• Condition: ${'{check_status.status}'} == "completed"</div>
            <div className="pl-4">• Max: 5m, Interval: 5s</div>
            <div className="pl-4">• Steps: HTTP GET /jobs/${'{'} job_id{'}'}</div>
            <div>3. Download results (after condition met)</div>
          </div>
        </div>
      </details>
    </div>
  );
}
