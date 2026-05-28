'use client';

import { useState } from 'react';
import {
  Sparkles,
  Search,
  FileText,
  Globe,
  Database,
  GitMerge,
  Network,
  Zap,
  FileCheck,
  Server,
  Chrome,
  Check,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { FlowDefinition } from '@/lib/api/types';
import {
  flowTemplates,
  getTemplatesByCategory,
  searchTemplates,
  templateCategories,
  type FlowTemplate,
  type TemplateCategory,
} from './templates';

interface TemplatesDialogProps {
  onApplyTemplate: (definition: FlowDefinition) => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const iconMap: Record<string, React.ElementType> = {
  Globe,
  Database,
  GitMerge,
  Network,
  Zap,
  FileCheck,
  Server,
  Chrome,
  FileText,
};

const difficultyColors: Record<string, string> = {
  beginner: 'bg-teal-400/10 text-teal-400',
  intermediate: 'bg-yellow-400/10 text-yellow-400',
  advanced: 'bg-red-400/10 text-red-400',
};

export default function TemplatesDialog({
  onApplyTemplate,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: TemplatesDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<FlowTemplate | null>(null);

  const open = controlledOpen !== undefined ? controlledOpen : isOpen;
  const setOpen = onOpenChange || setIsOpen;

  const filteredTemplates = searchQuery
    ? searchTemplates(searchQuery)
    : selectedCategory === 'all'
    ? flowTemplates
    : getTemplatesByCategory(selectedCategory);

  const handleApply = () => {
    if (selectedTemplate) {
      onApplyTemplate(selectedTemplate.definition);
      setOpen(false);
      setSelectedTemplate(null);
      setSearchQuery('');
      setSelectedCategory('all');
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedTemplate(null);
    setSearchQuery('');
    setSelectedCategory('all');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors">
            <Sparkles className="w-3.5 h-3.5" />
            Templates
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[95vw] sm:w-[1800px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Flow Templates
          </DialogTitle>
          <DialogDescription>
            Start with a pre-built template for common testing scenarios
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Sidebar */}
          <div className="w-64 flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a6480]" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 h-8 text-xs"
              />
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-0.5">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                    selectedCategory === 'all'
                      ? 'bg-teal-400/15 text-teal-400'
                      : 'text-[#4a6480] hover:bg-[#1a2d3d] hover:text-[#7fa8c8]'
                  )}
                >
                  <FileText className="w-3.5 h-3.5" />
                  All Templates
                  <span className="ml-auto text-[10px]">{flowTemplates.length}</span>
                </button>

                {Object.entries(templateCategories).map(([key, { label, icon }]) => {
                  const Icon = iconMap[icon] || FileText;
                  const count = getTemplatesByCategory(key as TemplateCategory).length;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key as TemplateCategory)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                        selectedCategory === key
                          ? 'bg-teal-400/15 text-teal-400'
                          : 'text-[#4a6480] hover:bg-[#1a2d3d] hover:text-[#7fa8c8]'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                      <span className="ml-auto text-[10px]">{count}</span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {selectedTemplate ? (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-base font-semibold text-[#c8dce8]">{selectedTemplate.name}</h3>
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', difficultyColors[selectedTemplate.difficulty])}>
                        {selectedTemplate.difficulty}
                      </span>
                    </div>
                    <p className="text-xs text-[#4a6480] mb-3">{selectedTemplate.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedTemplate.tags.map((tag) => (
                        <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-[#1e2d3d] bg-[#0f1923] text-[#4a6480]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="flex items-center h-7 px-3 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                  >
                    Back
                  </button>
                </div>

                <ScrollArea className="flex-1 border border-[#1e2d3d] rounded-lg p-4 bg-[#0b0f18]">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-xs text-[#7fa8c8] mb-2">Flow Details</h4>
                      <div className="space-y-1 text-xs">
                        <div className="text-[#4a6480]">
                          Name: <span className="text-[#7fa8c8]">{selectedTemplate.definition.name}</span>
                        </div>
                        <div className="text-[#4a6480]">
                          Suite: <span className="text-[#7fa8c8]">{selectedTemplate.definition.suite}</span>
                        </div>
                        {selectedTemplate.definition.tags && (
                          <div className="text-[#4a6480]">
                            Tags: <span className="text-[#7fa8c8]">{selectedTemplate.definition.tags.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedTemplate.definition.env && (
                      <div>
                        <h4 className="font-semibold text-xs text-[#7fa8c8] mb-2">Environment Variables</h4>
                        <div className="space-y-1 text-xs font-mono">
                          {Object.entries(selectedTemplate.definition.env).map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-[#4a6480]">{key}:</span>
                              <span className="text-[#7fa8c8]">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedTemplate.definition.setup && selectedTemplate.definition.setup.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-xs text-[#7fa8c8] mb-2">
                          Setup ({selectedTemplate.definition.setup.length})
                        </h4>
                        <div className="space-y-2">
                          {selectedTemplate.definition.setup.map((step, idx) => (
                            <div key={idx} className="p-2 bg-[#0f1923] rounded-lg border border-[#1e2d3d]">
                              <div className="font-medium text-xs text-[#c8dce8]">{step.name || step.id}</div>
                              <div className="text-[10px] text-[#4a6480]">{step.action}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="font-semibold text-xs text-[#7fa8c8] mb-2">
                        Steps ({selectedTemplate.definition.steps.length})
                      </h4>
                      <div className="space-y-2">
                        {selectedTemplate.definition.steps.map((step, idx) => (
                          <div key={idx} className="p-2 bg-[#0f1923] rounded-lg border border-[#1e2d3d]">
                            <div className="font-medium text-xs text-[#c8dce8]">{step.name || step.id}</div>
                            <div className="text-[10px] text-[#4a6480]">{step.action}</div>
                            {step.assert && step.assert.length > 0 && (
                              <div className="mt-1 flex items-center gap-1 text-[10px] text-teal-400">
                                <Check className="w-3 h-3" />
                                {step.assert.length} assertion{step.assert.length > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedTemplate.definition.teardown && selectedTemplate.definition.teardown.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-xs text-[#7fa8c8] mb-2">
                          Teardown ({selectedTemplate.definition.teardown.length})
                        </h4>
                        <div className="space-y-2">
                          {selectedTemplate.definition.teardown.map((step, idx) => (
                            <div key={idx} className="p-2 bg-[#0f1923] rounded-lg border border-[#1e2d3d]">
                              <div className="font-medium text-xs text-[#c8dce8]">{step.name || step.id}</div>
                              <div className="text-[10px] text-[#4a6480]">{step.action}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                {filteredTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Search className="w-12 h-12 text-[#3d5670] mb-3" />
                    <h3 className="font-semibold text-sm text-[#7fa8c8] mb-1">No templates found</h3>
                    <p className="text-xs text-[#4a6480]">Try adjusting your search or category filter</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 pr-2">
                    {filteredTemplates.map((template) => {
                      const Icon = iconMap[template.icon] || FileText;
                      return (
                        <button
                          key={template.id}
                          onClick={() => setSelectedTemplate(template)}
                          className="flex flex-col items-start gap-2 p-4 border border-[#1e2d3d] rounded-xl bg-[#0f1923] hover:border-teal-400/30 hover:bg-[#131b26] transition-colors text-left group"
                        >
                          <div className="flex items-start justify-between w-full">
                            <div className="p-2 rounded-lg bg-teal-400/10 text-teal-400">
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', difficultyColors[template.difficulty])}>
                              {template.difficulty}
                            </span>
                          </div>

                          <div className="flex-1 w-full">
                            <h4 className="font-semibold text-xs text-[#c8dce8] mb-1 group-hover:text-teal-400 transition-colors">
                              {template.name}
                            </h4>
                            <p className="text-[10px] text-[#4a6480] line-clamp-2">{template.description}</p>
                          </div>

                          <div className="flex flex-wrap gap-1 w-full">
                            {template.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-[9px] font-medium px-1.5 py-0.5 rounded border border-[#1e2d3d] bg-[#0b0f18] text-[#4a6480]">
                                {tag}
                              </span>
                            ))}
                            {template.tags.length > 3 && (
                              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border border-[#1e2d3d] bg-[#0b0f18] text-[#4a6480]">
                                +{template.tags.length - 3}
                              </span>
                            )}
                          </div>

                          <div className="text-[10px] text-[#3d5670]">
                            {template.definition.steps.length} steps
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={handleClose}
            className="flex items-center h-8 px-4 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          >
            Close
          </button>
          {selectedTemplate && (
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
            >
              Apply Template
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
