'use client';

import { Plus, X, Variable } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface KeyValuePair {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  label?: string;
  description?: string;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  allowVariables?: boolean;
  onVariablePick?: (field: 'key' | 'value', index: number) => void;
  className?: string;
}

export default function KeyValueEditor({
  label,
  description,
  value,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  allowVariables = true,
  onVariablePick,
  className,
}: KeyValueEditorProps) {
  const pairs: KeyValuePair[] = Object.entries(value).map(([key, val]) => ({
    key,
    value: val,
  }));

  const handleAdd = () => {
    const newPairs = [...pairs, { key: '', value: '' }];
    updateValue(newPairs);
  };

  const handleRemove = (index: number) => {
    const newPairs = pairs.filter((_, i) => i !== index);
    updateValue(newPairs);
  };

  const handleKeyChange = (index: number, key: string) => {
    const newPairs = [...pairs];
    newPairs[index] = { ...newPairs[index], key };
    updateValue(newPairs);
  };

  const handleValueChange = (index: number, val: string) => {
    const newPairs = [...pairs];
    newPairs[index] = { ...newPairs[index], value: val };
    updateValue(newPairs);
  };

  const updateValue = (newPairs: KeyValuePair[]) => {
    const newValue: Record<string, string> = {};
    newPairs.forEach((pair) => {
      if (pair.key) {
        newValue[pair.key] = pair.value;
      }
    });
    onChange(newValue);
  };

  return (
    <div className={cn('space-y-3', className)}>
      {label && (
        <div>
          <Label>{label}</Label>
          {description && (
            <p className="text-xs text-[#4a6480] mt-1">{description}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {pairs.length === 0 && (
          <div className="text-sm text-[#4a6480] text-center py-4 border border-dashed border-[#1e2d3d] rounded-lg">
            No items added yet
          </div>
        )}

        {pairs.map((pair, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="relative">
                <Input
                  value={pair.key}
                  onChange={(e) => handleKeyChange(index, e.target.value)}
                  placeholder={keyPlaceholder}
                  className="pr-8"
                />
                {allowVariables && onVariablePick && (
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                    onClick={() => onVariablePick('key', index)}
                    title="Insert variable"
                  >
                    <Variable className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  value={pair.value}
                  onChange={(e) => handleValueChange(index, e.target.value)}
                  placeholder={valuePlaceholder}
                  className={cn(allowVariables && 'pr-8')}
                />
                {allowVariables && onVariablePick && (
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                    onClick={() => onVariablePick('value', index)}
                    title="Insert variable"
                  >
                    <Variable className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="flex items-center justify-center h-9 w-9 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center justify-center gap-2 w-full h-8 rounded-lg border border-dashed border-[#1e2d3d] text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:border-[#2a3d52] transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Item
      </button>
    </div>
  );
}
