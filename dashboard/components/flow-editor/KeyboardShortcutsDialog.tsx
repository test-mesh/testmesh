'use client';

import { useState } from 'react';
import {
  Keyboard,
  Command,
  Search,
  Save,
  Play,
  Undo,
  Redo,
  Copy,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3x3,
  Sparkles,
  Settings2,
  FileDown,
  FolderOpen,
  MessageSquare,
  Info,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface KeyboardShortcut {
  keys: string[];
  description: string;
  category: string;
  icon?: React.ElementType;
}

const shortcuts: KeyboardShortcut[] = [
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'General', icon: Keyboard },
  { keys: ['Cmd', 'S'], description: 'Save flow', category: 'General', icon: Save },
  { keys: ['Cmd', 'Shift', 'S'], description: 'Save and run', category: 'General', icon: Play },
  { keys: ['Cmd', 'Z'], description: 'Undo', category: 'General', icon: Undo },
  { keys: ['Cmd', 'Shift', 'Z'], description: 'Redo', category: 'General', icon: Redo },
  { keys: ['Cmd', 'E'], description: 'Export flow', category: 'General', icon: FileDown },
  { keys: ['Cmd', 'Shift', 'E'], description: 'Open flow config', category: 'General', icon: Settings2 },
  { keys: ['Cmd', 'Shift', 'T'], description: 'Open templates', category: 'General', icon: FolderOpen },
  { keys: ['Cmd', 'F'], description: 'Search nodes', category: 'Search & Navigation', icon: Search },
  { keys: ['Cmd', 'K'], description: 'Quick command palette', category: 'Search & Navigation', icon: Command },
  { keys: ['Escape'], description: 'Close panels/dialogs', category: 'Search & Navigation' },
  { keys: ['Tab'], description: 'Navigate forward', category: 'Search & Navigation' },
  { keys: ['Shift', 'Tab'], description: 'Navigate backward', category: 'Search & Navigation' },
  { keys: ['Space', 'Drag'], description: 'Pan canvas', category: 'Canvas', icon: Grid3x3 },
  { keys: ['Cmd', '+'], description: 'Zoom in', category: 'Canvas', icon: ZoomIn },
  { keys: ['Cmd', '-'], description: 'Zoom out', category: 'Canvas', icon: ZoomOut },
  { keys: ['Cmd', '0'], description: 'Reset zoom', category: 'Canvas', icon: Maximize },
  { keys: ['Cmd', 'Shift', 'F'], description: 'Fit view', category: 'Canvas', icon: Maximize },
  { keys: ['Cmd', 'Shift', 'L'], description: 'Auto-layout nodes', category: 'Canvas', icon: Sparkles },
  { keys: ['Delete'], description: 'Delete selected node', category: 'Nodes', icon: Trash2 },
  { keys: ['Backspace'], description: 'Delete selected node', category: 'Nodes', icon: Trash2 },
  { keys: ['Cmd', 'C'], description: 'Copy selected node', category: 'Nodes', icon: Copy },
  { keys: ['Cmd', 'V'], description: 'Paste node', category: 'Nodes' },
  { keys: ['Cmd', 'D'], description: 'Duplicate selected node', category: 'Nodes' },
  { keys: ['Arrow Keys'], description: 'Move selected node', category: 'Nodes' },
  { keys: ['Shift', 'Arrow'], description: 'Move node (fine)', category: 'Nodes' },
  { keys: ['Cmd', 'A'], description: 'Select all nodes', category: 'Nodes' },
  { keys: ['Enter'], description: 'Edit selected node', category: 'Editing', icon: MessageSquare },
  { keys: ['Cmd', 'Enter'], description: 'Submit form/comment', category: 'Editing' },
  { keys: ['F2'], description: 'Rename selected node', category: 'Editing' },
  { keys: ['Cmd', '/'], description: 'Toggle comments', category: 'Editing', icon: MessageSquare },
  { keys: ['Cmd', 'Shift', 'V'], description: 'Toggle visual/YAML mode', category: 'View' },
  { keys: ['Cmd', '['], description: 'Hide left panel', category: 'View' },
  { keys: ['Cmd', ']'], description: 'Hide right panel', category: 'View' },
];

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';

const keySymbols: Record<string, string> = {
  'Cmd': modKey,
  'Ctrl': isMac ? '⌃' : 'Ctrl',
  'Alt': isMac ? '⌥' : 'Alt',
  'Shift': isMac ? '⇧' : 'Shift',
  'Enter': isMac ? '↵' : 'Enter',
  'Delete': isMac ? '⌫' : 'Del',
  'Backspace': isMac ? '⌫' : 'Backspace',
  'Escape': 'Esc',
  'Arrow Keys': '←→↑↓',
  'Space': '␣',
  'Tab': '⇥',
};

const categoryOrder = ['General', 'Search & Navigation', 'Canvas', 'Nodes', 'Editing', 'View'];

export interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredShortcuts = shortcuts.filter((shortcut) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      shortcut.description.toLowerCase().includes(query) ||
      shortcut.category.toLowerCase().includes(query) ||
      shortcut.keys.some((key) => key.toLowerCase().includes(query))
    );
  });

  const groupedShortcuts = filteredShortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) acc[shortcut.category] = [];
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, KeyboardShortcut[]>);

  const renderKeys = (keys: string[]) => (
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <span className="text-[#3d5670] text-xs">+</span>}
          <kbd className="px-2 py-0.5 text-xs font-mono rounded border border-[#2a3d52] bg-[#1a2332] text-[#7fa8c8] shadow-sm min-w-[24px] text-center">
            {keySymbols[key] || key}
          </kbd>
        </span>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#1a2332]">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Keyboard className="h-5 w-5 text-teal-400" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Master these shortcuts to work faster in the flow editor
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-[#1a2332]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#4a6480]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts..."
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredShortcuts.length === 0 ? (
            <div className="text-center py-12 text-[#3d5670]">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No shortcuts found</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-6">
              {categoryOrder.filter((cat) => groupedShortcuts[cat]).map((category) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-[#7fa8c8] mb-3 flex items-center gap-2">
                    {category}
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                      {groupedShortcuts[category].length}
                    </span>
                  </h3>
                  <div className="space-y-1.5">
                    {groupedShortcuts[category].map((shortcut, index) => {
                      const Icon = shortcut.icon;
                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-[#1e2d3d] bg-[#0f1923] hover:bg-[#131b26] transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            {Icon && (
                              <div className="p-1.5 rounded bg-[#1a2332]">
                                <Icon className="h-3 w-3 text-[#4a6480]" />
                              </div>
                            )}
                            <span className="text-xs text-[#7fa8c8]">{shortcut.description}</span>
                          </div>
                          {renderKeys(shortcut.keys)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#1a2332] bg-[#0b0f18]">
          <div className="flex items-start gap-2 text-[10px] text-[#4a6480]">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#3d5670]" />
            <div>
              <p className="font-medium mb-1 text-[#7fa8c8]">Pro Tips:</p>
              <ul className="space-y-0.5 ml-3 list-disc">
                <li>Press <kbd className="px-1 py-0.5 rounded border border-[#2a3d52] bg-[#1a2332] text-[10px]">?</kbd> anytime to open this dialog</li>
                <li>Most shortcuts work in visual mode only</li>
                <li>On {isMac ? 'Windows/Linux' : 'Mac'}, use {isMac ? 'Ctrl' : 'Cmd'} instead of {modKey}</li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
