'use client';

import { Repeat } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import StepList from './StepList';

interface ForEachFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function ForEachForm({
  config,
  onChange,
  className,
}: ForEachFormProps) {
  const steps = Array.isArray(config.steps) ? (config.steps as string[]) : [];

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Repeat className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-medium">For Each</span>
      </div>

      {/* Items */}
      <div className="space-y-2">
        <Label htmlFor="foreach-items" className="text-xs">
          Items (expression or JSON array)
        </Label>
        <Input
          id="foreach-items"
          value={(config.items as string) || ''}
          onChange={(e) => onChange('items', e.target.value)}
          placeholder='${users} or ["a","b","c"]'
          className="font-mono text-sm"
        />
        <p className="text-[10px] text-muted-foreground">
          Variable expression or inline JSON array to iterate over.
        </p>
      </div>

      {/* Item variable name */}
      <div className="space-y-2">
        <Label htmlFor="foreach-item-var" className="text-xs">
          Item variable name
        </Label>
        <Input
          id="foreach-item-var"
          value={(config.item_var as string) || 'item'}
          onChange={(e) => onChange('item_var', e.target.value)}
          placeholder="item"
          className="font-mono text-sm"
        />
        <p className="text-[10px] text-muted-foreground">
          Name of the loop variable accessible inside each iteration (e.g. {'${item}'}).
        </p>
      </div>

      {/* Max iterations */}
      <div className="space-y-2">
        <Label htmlFor="foreach-max-iterations" className="text-xs">
          Max iterations{' '}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="foreach-max-iterations"
          type="number"
          min={0}
          value={config.max_iterations ? String(config.max_iterations) : ''}
          onChange={(e) => {
            const val = e.target.value;
            onChange('max_iterations', val === '' ? undefined : Number(val));
          }}
          placeholder="0 (unlimited)"
          className="font-mono text-sm"
        />
      </div>

      {/* Continue on error */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="foreach-continue-on-error" className="text-xs">
            Continue on error
          </Label>
          <p className="text-[10px] text-muted-foreground">
            Keep iterating even if a step fails.
          </p>
        </div>
        <Switch
          id="foreach-continue-on-error"
          checked={Boolean(config.continue_on_error)}
          onCheckedChange={(checked) => onChange('continue_on_error', checked)}
        />
      </div>

      {/* Parallel */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="foreach-parallel" className="text-xs">
            Run iterations in parallel
          </Label>
          <p className="text-[10px] text-muted-foreground">
            Execute all iterations concurrently instead of sequentially.
          </p>
        </div>
        <Switch
          id="foreach-parallel"
          checked={Boolean(config.parallel)}
          onCheckedChange={(checked) => onChange('parallel', checked)}
        />
      </div>

      {/* Steps */}
      <details className="space-y-3 p-3 border rounded-lg" open>
        <summary className="text-sm font-medium cursor-pointer">
          Loop steps
        </summary>
        <div className="pt-3">
          <StepList
            label="Loop steps"
            steps={steps}
            onChange={(updated) => onChange('steps', updated)}
          />
          <p className="text-[10px] text-muted-foreground mt-2">
            Steps executed for each item in the collection. Use {'${item}'} to access the current value.
          </p>
        </div>
      </details>
    </div>
  );
}
