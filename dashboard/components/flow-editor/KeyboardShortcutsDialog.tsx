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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface KeyboardShortcut {
  keys: string[];
  description: string;
  category: string;
  icon?: React.ElementType;
}

const shortcuts: KeyboardShortcut[] = [
  // General
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'General', icon: Keyboard },
  { keys: ['Cmd', 'S'], description: 'Save flow', category: 'General', icon: Save },
  { keys: ['Cmd', 'Shift', 'S'], description: 'Save and run', category: 'General', icon: Play },
  { keys: ['Cmd', 'Z'], description: 'Undo', category: 'General', icon: Undo },
  { keys: ['Cmd', 'Shift', 'Z'], description: 'Redo', category: 'General', icon: Redo },
  { keys: ['Cmd', 'E'], description: 'Export flow', category: 'General', icon: FileDown },
  { keys: ['Cmd', 'Shift', 'E'], description: 'Open flow config', category: 'General', icon: Settings2 },
  { keys: ['Cmd', 'Shift', 'T'], description: 'Open templates', category: 'General', icon: FolderOpen },

  // Search & Navigation
  { keys: ['Cmd', 'F'], description: 'Search nodes', category: 'Search & Navigation', icon: Search },
  { keys: ['Cmd', 'K'], description: 'Quick command palette', category: 'Search & Navigation', icon: Command },
  { keys: ['Escape'], description: 'Close panels/dialogs', category: 'Search & Navigation' },
  { keys: ['Tab'], description: 'Navigate forward', category: 'Search & Navigation' },
  { keys: ['Shift', 'Tab'], description: 'Navigate backward', category: 'Search & Navigation' },

  // Canvas Operations
  { keys: ['Space', 'Drag'], description: 'Pan canvas', category: 'Canvas', icon: Grid3x3 },
  { keys: ['Cmd', '+'], description: 'Zoom in', category: 'Canvas', icon: ZoomIn },
  { keys: ['Cmd', '-'], description: 'Zoom out', category: 'Canvas', icon: ZoomOut },
  { keys: ['Cmd', '0'], description: 'Reset zoom', category: 'Canvas', icon: Maximize },
  { keys: ['Cmd', 'Shift', 'F'], description: 'Fit view', category: 'Canvas', icon: Maximize },
  { keys: ['Cmd', 'Shift', 'L'], description: 'Auto-layout nodes', category: 'Canvas', icon: Sparkles },

  // Node Operations
  { keys: ['Delete'], description: 'Delete selected node', category: 'Nodes', icon: Trash2 },
  { keys: ['Backspace'], description: 'Delete selected node', category: 'Nodes', icon: Trash2 },
  { keys: ['Cmd', 'C'], description: 'Copy selected node', category: 'Nodes', icon: Copy },
  { keys: ['Cmd', 'V'], description: 'Paste node', category: 'Nodes' },
  { keys: ['Cmd', 'D'], description: 'Duplicate selected node', category: 'Nodes' },
  { keys: ['Arrow Keys'], description: 'Move selected node', category: 'Nodes' },
  { keys: ['Shift', 'Arrow'], description: 'Move node (fine)', category: 'Nodes' },
  { keys: ['Cmd', 'A'], description: 'Select all nodes', category: 'Nodes' },

  // Editing
  { keys: ['Enter'], description: 'Edit selected node', category: 'Editing', icon: MessageSquare },
  { keys: ['Cmd', 'Enter'], description: 'Submit form/comment', category: 'Editing' },
  { keys: ['F2'], description: 'Rename selected node', category: 'Editing' },
  { keys: ['Cmd', '/'], description: 'Toggle comments', category: 'Editing', icon: MessageSquare },

  // View Modes
  { keys: ['Cmd', 'Shift', 'V'], description: 'Toggle visual/YAML mode', category: 'View' },
  { keys: ['Cmd', '['], description: 'Hide left panel', category: 'View' },
  { keys: ['Cmd', ']'], description: 'Hide right panel', category: 'View' },
];

// Platform-specific modifier key
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

export interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter shortcuts by search query
  const filteredShortcuts = shortcuts.filter((shortcut) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      shortcut.description.toLowerCase().includes(query) ||
      shortcut.category.toLowerCase().includes(query) ||
      shortcut.keys.some((key) => key.toLowerCase().includes(query))
    );
  });

  // Group shortcuts by category
  const groupedShortcuts = filteredShortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, KeyboardShortcut[]>);

  // Category order
  const categoryOrder = [
    'General',
    'Search & Navigation',
    'Canvas',
    'Nodes',
    'Editing',
    'View',
  ];

  // Render keyboard shortcut keys
  const renderKeys = (keys: string[]) => {
    return (
      <div className="flex items-center gap-1">
        {keys.map((key, index) => (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && <span className="text-muted-foreground text-xs">+</span>}
            <kbd
              className={cn(
                'px-2 py-1 text-xs font-mono rounded border',
                'bg-muted text-muted-foreground',
                'shadow-sm min-w-[24px] text-center'
              )}
            >
              {keySymbols[key] || key}
            </kbd>
          </span>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Master these shortcuts to work faster in the flow editor
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts..."
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredShortcuts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No shortcuts found</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-6">
              {categoryOrder
                .filter((category) => groupedShortcuts[category])
                .map((category) => (
                  <div key={category}>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      {category}
                      <Badge variant="secondary" className="text-[10px]">
                        {groupedShortcuts[category].length}
                      </Badge>
                    </h3>
                    <div className="space-y-2">
                      {groupedShortcuts[category].map((shortcut, index) => {
                        const Icon = shortcut.icon;
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              {Icon && (
                                <div className="p-1.5 rounded bg-muted">
                                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                              )}
                              <span className="text-sm">{shortcut.description}</span>
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

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/20">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">Pro Tips:</p>
              <ul className="space-y-0.5 ml-4 list-disc">
                <li>Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">?</kbd> anytime to open this dialog</li>
                <li>Most shortcuts work in visual mode only</li>
                <li>
                  On {isMac ? 'Windows/Linux' : 'Mac'}, use {isMac ? 'Ctrl' : 'Cmd'} instead of {modKey}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
