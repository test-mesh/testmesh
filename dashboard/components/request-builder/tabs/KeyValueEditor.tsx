'use client';

import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
  const addPair = () => {
    onChange([...pairs, createEmptyPair()]);
  };

  const updatePair = (id: string, field: keyof KeyValuePair, value: string | boolean) => {
    onChange(
      pairs.map((pair) => (pair.id === id ? { ...pair, [field]: value } : pair))
    );
  };

  const removePair = (id: string) => {
    onChange(pairs.filter((pair) => pair.id !== id));
  };

  const togglePair = (id: string) => {
    const pair = pairs.find((p) => p.id === id);
    if (pair) {
      updatePair(id, 'enabled', !pair.enabled);
    }
  };

  // Ensure there's always at least one empty row for adding new pairs
  const displayPairs = pairs.length === 0 ? [createEmptyPair()] : pairs;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-1">
        <div className="w-6"></div>
        <div className="flex-1">{keyPlaceholder}</div>
        <div className="flex-1">{valuePlaceholder}</div>
        {showDescription && <div className="flex-1">Description</div>}
        <div className="w-8"></div>
      </div>

      {/* Rows */}
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
              className={cn(
                'h-8 text-sm font-mono flex-1',
                !pair.enabled && 'opacity-50'
              )}
            />
            <Input
              value={pair.value}
              onChange={(e) => updatePair(pair.id, 'value', e.target.value)}
              placeholder={valuePlaceholder}
              className={cn(
                'h-8 text-sm font-mono flex-1',
                !pair.enabled && 'opacity-50'
              )}
            />
            {showDescription && (
              <Input
                value={pair.description || ''}
                onChange={(e) => updatePair(pair.id, 'description', e.target.value)}
                placeholder="Description"
                className={cn(
                  'h-8 text-sm flex-1',
                  !pair.enabled && 'opacity-50'
                )}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removePair(pair.id)}
              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={addPair}
        className="text-xs text-muted-foreground"
      >
        <Plus className="w-3 h-3 mr-1" />
        Add
      </Button>
    </div>
  );
}
