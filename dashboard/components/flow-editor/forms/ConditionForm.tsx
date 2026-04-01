'use client';

import { useState } from 'react';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConditionFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

function StepList({
  label,
  steps,
  onAdd,
  onRemove,
}: {
  label: string;
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
      <Label className="text-xs">{label}</Label>
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

export default function ConditionForm({
  config,
  onChange,
  className,
}: ConditionFormProps) {
  const thenSteps = Array.isArray(config.then_steps) ? (config.then_steps as string[]) : [];
  const elseSteps = Array.isArray(config.else_steps) ? (config.else_steps as string[]) : [];

  const addThenStep = (id: string) => onChange('then_steps', [...thenSteps, id]);
  const removeThenStep = (index: number) =>
    onChange('then_steps', thenSteps.filter((_, i) => i !== index));

  const addElseStep = (id: string) => onChange('else_steps', [...elseSteps, id]);
  const removeElseStep = (index: number) =>
    onChange('else_steps', elseSteps.filter((_, i) => i !== index));

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <GitBranch className="h-4 w-4 text-cyan-500" />
        <span className="text-sm font-medium">Condition</span>
      </div>

      {/* Expression */}
      <div className="space-y-2">
        <Label htmlFor="condition-expression" className="text-xs">
          Condition expression
        </Label>
        <Input
          id="condition-expression"
          value={(config.expression as string) || ''}
          onChange={(e) => onChange('expression', e.target.value)}
          placeholder='${status} == "active"'
          className="font-mono text-sm"
        />
        <p className="text-[10px] text-muted-foreground">
          Expression that evaluates to true or false. Use {'${variable}'} syntax.
        </p>
      </div>

      {/* Then steps */}
      <details className="space-y-3 p-3 border rounded-lg" open>
        <summary className="text-sm font-medium cursor-pointer text-green-600 dark:text-green-400">
          Then branch (true)
        </summary>
        <div className="pt-3">
          <StepList
            label="Steps to run when condition is true"
            steps={thenSteps}
            onAdd={addThenStep}
            onRemove={removeThenStep}
          />
        </div>
      </details>

      {/* Else steps */}
      <details className="space-y-3 p-3 border rounded-lg" open>
        <summary className="text-sm font-medium cursor-pointer text-red-600 dark:text-red-400">
          Else branch (false)
        </summary>
        <div className="pt-3">
          <StepList
            label="Steps to run when condition is false"
            steps={elseSteps}
            onAdd={addElseStep}
            onRemove={removeElseStep}
          />
        </div>
      </details>
    </div>
  );
}
