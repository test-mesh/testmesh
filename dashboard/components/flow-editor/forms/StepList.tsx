'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface StepListProps {
  label: string;
  steps: string[];
  onChange: (steps: string[]) => void;
}

export default function StepList({ label, steps, onChange }: StepListProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onChange([...steps, trimmed]);
    setInputValue('');
  };

  const handleRemove = (index: number) => {
    onChange(steps.filter((_, i) => i !== index));
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
            <li key={stepId} className="flex items-center gap-2">
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
                onClick={() => handleRemove(i)}
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
