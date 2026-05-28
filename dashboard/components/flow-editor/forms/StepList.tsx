'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

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

  const handleRemove = (index: number) => onChange(steps.filter((_, i) => i !== index));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {steps.length > 0 ? (
        <ol className="space-y-1 mb-2">
          {steps.map((stepId, i) => (
            <li key={stepId} className="flex items-center gap-2">
              <span className="text-[10px] text-[#4a6480] w-5 text-right shrink-0">{i + 1}.</span>
              <span className="font-mono text-xs flex-1 bg-[#1a2332] rounded-lg px-2 py-1 truncate text-[#7fa8c8]">
                {stepId}
              </span>
              <button
                onClick={() => handleRemove(i)}
                className="flex items-center justify-center h-6 w-6 rounded shrink-0 text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-[#4a6480] italic mb-2">No steps added yet.</p>
      )}
      <div className="flex gap-1">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="step_id"
          className="h-7 text-xs font-mono flex-1"
        />
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 h-7 px-2 rounded-lg text-xs border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] shrink-0 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
    </div>
  );
}
