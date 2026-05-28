'use client';

import { useState, useEffect } from 'react';
import { Folder, Palette } from 'lucide-react';
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
  collection?: Collection | null;
  parentId?: string;
  onSubmit: (data: CreateCollectionRequest | UpdateCollectionRequest) => Promise<void>;
  isLoading?: boolean;
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#64748b',
];

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
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Collection"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of this collection..."
                rows={2}
              />
            </div>

            <div className="flex gap-4">
              <div className="space-y-2 flex-1">
                <Label className="text-xs">Icon (optional)</Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowIconPicker(!showIconPicker)}
                    className="w-full flex items-center h-9 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] transition-colors"
                  >
                    {icon ? (
                      <span className="text-lg mr-2">{icon}</span>
                    ) : (
                      <span className="text-[#4a6480]">Select icon</span>
                    )}
                  </button>
                  {showIconPicker && (
                    <div className="absolute top-full left-0 mt-1 p-2 bg-[#0f1923] border border-[#1e2d3d] rounded-lg shadow-lg z-50 grid grid-cols-5 gap-1">
                      <button
                        type="button"
                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#1a2d3d] text-[10px] text-[#4a6480]"
                        onClick={() => { setIcon(''); setShowIconPicker(false); }}
                      >
                        None
                      </button>
                      {PRESET_ICONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#1a2d3d] text-lg"
                          onClick={() => { setIcon(emoji); setShowIconPicker(false); }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 flex-1">
                <Label className="text-xs">Color</Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-full flex items-center gap-2 h-9 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] transition-colors"
                  >
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                    <Palette className="w-3.5 h-3.5 text-[#4a6480]" />
                  </button>
                  {showColorPicker && (
                    <div className="absolute top-full left-0 mt-1 p-2 bg-[#0f1923] border border-[#1e2d3d] rounded-lg shadow-lg z-50 grid grid-cols-5 gap-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="w-8 h-8 rounded hover:scale-110 transition-transform"
                          style={{ backgroundColor: c }}
                          onClick={() => { setColor(c); setShowColorPicker(false); }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex items-center h-8 px-4 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isLoading}
              className="flex items-center h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
