'use client';

import { useState } from 'react';
import { Repeat, Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ForEachFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

function StepList({
  steps,
  onAdd,
  onRemove,
}: {
  steps: string[];
  onAdd: (id: string) => void;
  onRemove: (index: number) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      {steps.length > 0 ? (
        <ol className="space-y-1 mb-2">
          {steps.map((stepId, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                {i + 1}.
              </span>
              <span className="font-mono text-xs flex-1 bg-muted rounded px-2 py-1 truncate">
                {stepId}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(i)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground italic mb-2">No steps added yet.</p>
      )}
      <div className="flex gap-1">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="step_id"
          className="h-7 text-xs font-mono flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs shrink-0"
          onClick={handleAdd}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}

export default function ForEachForm({
  config,
  onChange,
  className,
}: ForEachFormProps) {
  const steps = Array.isArray(config.steps) ? (config.steps as string[]) : [];

  const addStep = (id: string) => onChange('steps', [...steps, id]);
  const removeStep = (index: number) =>
    onChange('steps', steps.filter((_, i) => i !== index));

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
          value={
            config.max_iterations !== undefined && config.max_iterations !== null
              ? String(config.max_iterations)
              : ''
          }
          onChange={(e) => {
            const val = e.target.value;
            onChange('max_iterations', val === '' ? 0 : Number(val));
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
          <StepList steps={steps} onAdd={addStep} onRemove={removeStep} />
          <p className="text-[10px] text-muted-foreground mt-2">
            Steps executed for each item in the collection. Use {'${item}'} to access the current value.
          </p>
        </div>
      </details>
    </div>
  );
}
