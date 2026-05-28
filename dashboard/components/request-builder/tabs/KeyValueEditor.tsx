'use client';

import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { KeyValuePair } from '../types';
import { createEmptyPair } from '../types';

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  showDescription?: boolean;
  className?: string;
}

export default function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  showDescription = false,
  className,
}: KeyValueEditorProps) {
  const addPair = () => onChange([...pairs, createEmptyPair()]);

  const updatePair = (id: string, field: keyof KeyValuePair, value: string | boolean) => {
    onChange(pairs.map((pair) => (pair.id === id ? { ...pair, [field]: value } : pair)));
  };

  const removePair = (id: string) => onChange(pairs.filter((pair) => pair.id !== id));

  const togglePair = (id: string) => {
    const pair = pairs.find((p) => p.id === id);
    if (pair) updatePair(id, 'enabled', !pair.enabled);
  };

  const displayPairs = pairs.length === 0 ? [createEmptyPair()] : pairs;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2 text-[10px] font-medium text-[#4a6480] px-1">
        <div className="w-6" />
        <div className="flex-1">{keyPlaceholder}</div>
        <div className="flex-1">{valuePlaceholder}</div>
        {showDescription && <div className="flex-1">Description</div>}
        <div className="w-8" />
      </div>

      <div className="space-y-1">
        {displayPairs.map((pair) => (
          <div key={pair.id} className="flex items-center gap-2 group">
            <Checkbox
              checked={pair.enabled}
              onCheckedChange={() => togglePair(pair.id)}
              className="data-[state=unchecked]:opacity-50"
            />
            <Input
              value={pair.key}
              onChange={(e) => updatePair(pair.id, 'key', e.target.value)}
              placeholder={keyPlaceholder}
              className={cn('h-8 text-xs font-mono flex-1', !pair.enabled && 'opacity-50')}
            />
            <Input
              value={pair.value}
              onChange={(e) => updatePair(pair.id, 'value', e.target.value)}
              placeholder={valuePlaceholder}
              className={cn('h-8 text-xs font-mono flex-1', !pair.enabled && 'opacity-50')}
            />
            {showDescription && (
              <Input
                value={pair.description || ''}
                onChange={(e) => updatePair(pair.id, 'description', e.target.value)}
                placeholder="Description"
                className={cn('h-8 text-xs flex-1', !pair.enabled && 'opacity-50')}
              />
            )}
            <button
              onClick={() => removePair(pair.id)}
              className="flex items-center justify-center h-8 w-8 rounded opacity-0 group-hover:opacity-100 text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addPair}
        className="flex items-center gap-1 h-7 px-2 rounded text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
      >
        <Plus className="w-3 h-3" />
        Add
      </button>
    </div>
  );
}
