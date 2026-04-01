'use client';

import { GitBranch } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import StepList from './StepList';

interface ConditionFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function ConditionForm({
  config,
  onChange,
  className,
}: ConditionFormProps) {
  const thenSteps = Array.isArray(config.then_steps) ? (config.then_steps as string[]) : [];
  const elseSteps = Array.isArray(config.else_steps) ? (config.else_steps as string[]) : [];

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
            onChange={(steps) => onChange('then_steps', steps)}
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
            onChange={(steps) => onChange('else_steps', steps)}
          />
        </div>
      </details>
    </div>
  );
}
