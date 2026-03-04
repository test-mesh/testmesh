'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export interface RetryConfig {
  enabled?: boolean;
  max_attempts?: number;
  delay?: string;
  backoff?: 'linear' | 'exponential' | 'constant';
  retry_on?: string[];
  retry_on_not?: string[];
}

interface RetryConfigPanelProps {
  value: RetryConfig;
  onChange: (value: RetryConfig) => void;
  className?: string;
}

export default function RetryConfigPanel({
  value,
  onChange,
  className,
}: RetryConfigPanelProps) {
  const enabled = value.enabled ?? false;
  const maxAttempts = value.max_attempts ?? 3;
  const delay = value.delay ?? '1s';
  const backoff = value.backoff ?? 'exponential';

  const handleToggle = (checked: boolean) => {
    onChange({ ...value, enabled: checked });
  };

  const handleMaxAttemptsChange = (attempts: number[]) => {
    onChange({ ...value, max_attempts: attempts[0] });
  };

  const handleDelayChange = (newDelay: string) => {
    onChange({ ...value, delay: newDelay });
  };

  const handleBackoffChange = (newBackoff: string) => {
    onChange({ ...value, backoff: newBackoff as 'linear' | 'exponential' | 'constant' });
  };

  // Parse delay to display as seconds
  const delayInSeconds = parseInt(delay.replace(/[^\d]/g, '')) || 1;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Enable/Disable Retry */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Retry on Failure</Label>
          <p className="text-xs text-muted-foreground">
            Automatically retry step if it fails
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
        />
      </div>

      {enabled && (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          {/* Max Attempts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Max Attempts</Label>
              <span className="text-sm font-medium">{maxAttempts}</span>
            </div>
            <Slider
              value={[maxAttempts]}
              onValueChange={handleMaxAttemptsChange}
              min={1}
              max={10}
              step={1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Including the initial attempt (1-10 total attempts)
            </p>
          </div>

          {/* Delay */}
          <div className="space-y-2">
            <Label htmlFor="retry_delay">Initial Delay</Label>
            <div className="flex items-center gap-2">
              <Input
                id="retry_delay"
                type="number"
                min="0"
                step="0.1"
                value={delayInSeconds}
                onChange={(e) => handleDelayChange(`${e.target.value}s`)}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Time to wait before the first retry
            </p>
          </div>

          {/* Backoff Strategy */}
          <div className="space-y-2">
            <Label htmlFor="backoff">Backoff Strategy</Label>
            <Select value={backoff} onValueChange={handleBackoffChange}>
              <SelectTrigger id="backoff">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="constant">
                  <div>
                    <div className="font-medium">Constant</div>
                    <div className="text-xs text-muted-foreground">
                      Same delay each time
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="linear">
                  <div>
                    <div className="font-medium">Linear</div>
                    <div className="text-xs text-muted-foreground">
                      Increases by delay each time (1s, 2s, 3s...)
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="exponential">
                  <div>
                    <div className="font-medium">Exponential (Recommended)</div>
                    <div className="text-xs text-muted-foreground">
                      Doubles each time (1s, 2s, 4s, 8s...)
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Backoff Preview */}
          <div className="p-3 bg-background rounded border">
            <Label className="text-xs mb-2 block">Retry Schedule Preview</Label>
            <div className="text-xs font-mono space-y-1">
              {Array.from({ length: Math.min(maxAttempts - 1, 4) }, (_, i) => {
                let waitTime = delayInSeconds;
                if (backoff === 'linear') {
                  waitTime = delayInSeconds * (i + 1);
                } else if (backoff === 'exponential') {
                  waitTime = delayInSeconds * Math.pow(2, i);
                }
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-muted-foreground">Retry {i + 1}:</span>
                    <span>after {waitTime}s</span>
                  </div>
                );
              })}
              {maxAttempts > 5 && (
                <div className="text-muted-foreground">
                  ... and {maxAttempts - 5} more
                </div>
              )}
            </div>
          </div>

          {/* Retry Conditions (Advanced) */}
          <details className="space-y-2">
            <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
              Advanced: Retry Conditions
            </summary>
            <div className="pl-4 space-y-2 pt-2">
              <p className="text-xs text-muted-foreground">
                Specify conditions when retry should occur (e.g., "status {'>='} 500", "timeout")
              </p>
              <Input
                placeholder="status >= 500"
                value={value.retry_on?.[0] || ''}
                onChange={(e) => onChange({ ...value, retry_on: e.target.value ? [e.target.value] : undefined })}
                className="text-sm"
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
