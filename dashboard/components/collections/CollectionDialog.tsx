'use client';

import { useState, useEffect } from 'react';
import { Folder, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Collection, CreateCollectionRequest, UpdateCollectionRequest } from '@/lib/api/types';

interface CollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection?: Collection | null; // null = create, existing = edit
  parentId?: string;
  onSubmit: (data: CreateCollectionRequest | UpdateCollectionRequest) => Promise<void>;
  isLoading?: boolean;
}

// Preset colors for collections
const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#84cc16', // Lime
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#0ea5e9', // Sky
  '#3b82f6', // Blue
  '#64748b', // Slate
];

// Preset icons (emojis)
const PRESET_ICONS = [
  '📁', '📂', '🗂️', '📋', '📝',
  '🧪', '🔬', '⚗️', '🔧', '⚙️',
  '🚀', '⭐', '💡', '🎯', '🔥',
  '✅', '❌', '⚠️', '🔒', '🔑',
];

export default function CollectionDialog({
  open,
  onOpenChange,
  collection,
  parentId,
  onSubmit,
  isLoading,
}: CollectionDialogProps) {
  const isEditing = !!collection;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Reset form when dialog opens/closes or collection changes
  useEffect(() => {
    if (open) {
      if (collection) {
        setName(collection.name);
        setDescription(collection.description || '');
        setIcon(collection.icon || '');
        setColor(collection.color || PRESET_COLORS[0]);
      } else {
        setName('');
        setDescription('');
        setIcon('');
        setColor(PRESET_COLORS[0]);
      }
    }
  }, [open, collection]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    const data: CreateCollectionRequest | UpdateCollectionRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      icon: icon || undefined,
      color: color || undefined,
      ...(isEditing ? {} : { parent_id: parentId }),
    };

    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {icon && <span className="text-xl">{icon}</span>}
              <Folder className="w-5 h-5" style={{ color }} />
              {isEditing ? 'Edit Collection' : 'Create Collection'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the collection details below.'
                : 'Create a new collection to organize your flows.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Collection"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of this collection..."
                rows={2}
              />
            </div>

            {/* Icon & Color */}
            <div className="flex gap-4">
              {/* Icon picker */}
              <div className="space-y-2 flex-1">
                <Label>Icon (optional)</Label>
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setShowIconPicker(!showIconPicker)}
                  >
                    {icon ? (
                      <span className="text-lg mr-2">{icon}</span>
                    ) : (
                      <span className="text-muted-foreground">Select icon</span>
                    )}
                  </Button>
                  {showIconPicker && (
                    <div className="absolute top-full left-0 mt-1 p-2 bg-popover border rounded-lg shadow-lg z-50 grid grid-cols-5 gap-1">
                      <button
                        type="button"
                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-muted text-xs text-muted-foreground"
                        onClick={() => {
                          setIcon('');
                          setShowIconPicker(false);
                        }}
                      >
                        None
                      </button>
                      {PRESET_ICONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="w-8 h-8 flex items-center justify-center rounded hover:bg-muted text-lg"
                          onClick={() => {
                            setIcon(emoji);
                            setShowIconPicker(false);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Color picker */}
              <div className="space-y-2 flex-1">
                <Label>Color</Label>
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                  >
                    <div
                      className="w-4 h-4 rounded mr-2"
                      style={{ backgroundColor: color }}
                    />
                    <Palette className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  {showColorPicker && (
                    <div className="absolute top-full left-0 mt-1 p-2 bg-popover border rounded-lg shadow-lg z-50 grid grid-cols-5 gap-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="w-8 h-8 rounded hover:scale-110 transition-transform"
                          style={{ backgroundColor: c }}
                          onClick={() => {
                            setColor(c);
                            setShowColorPicker(false);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
