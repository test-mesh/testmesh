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
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
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

const difficultyColors = {
  beginner: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  intermediate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  advanced: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
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

  // Use controlled or uncontrolled state
  const open = controlledOpen !== undefined ? controlledOpen : isOpen;
  const setOpen = onOpenChange || setIsOpen;

  // Filter templates
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
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Sparkles className="w-4 h-4" />
            Templates
          </Button>
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
          <div className="w-64 flex flex-col gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            {/* Categories */}
            <ScrollArea className="flex-1">
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    selectedCategory === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  <FileText className="w-4 h-4" />
                  All Templates
                  <span className="ml-auto text-xs">{flowTemplates.length}</span>
                </button>

                {Object.entries(templateCategories).map(([key, { label, icon }]) => {
                  const Icon = iconMap[icon] || FileText;
                  const count = getTemplatesByCategory(key as TemplateCategory).length;

                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key as TemplateCategory)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        selectedCategory === key
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                      <span className="ml-auto text-xs">{count}</span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {selectedTemplate ? (
              /* Template Details */
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{selectedTemplate.name}</h3>
                      <Badge className={difficultyColors[selectedTemplate.difficulty]}>
                        {selectedTemplate.difficulty}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {selectedTemplate.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selectedTemplate.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>
                    Back
                  </Button>
                </div>

                {/* Template Preview */}
                <ScrollArea className="flex-1 border rounded-lg p-4 bg-muted/30">
                  <div className="space-y-4">
                    {/* Metadata */}
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Flow Details</h4>
                      <div className="space-y-1 text-xs">
                        <div>
                          <span className="text-muted-foreground">Name:</span>{' '}
                          {selectedTemplate.definition.name}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Suite:</span>{' '}
                          {selectedTemplate.definition.suite}
                        </div>
                        {selectedTemplate.definition.tags && (
                          <div>
                            <span className="text-muted-foreground">Tags:</span>{' '}
                            {selectedTemplate.definition.tags.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Environment Variables */}
                    {selectedTemplate.definition.env && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Environment Variables</h4>
                        <div className="space-y-1 text-xs font-mono">
                          {Object.entries(selectedTemplate.definition.env).map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-muted-foreground">{key}:</span>
                              <span>{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Setup Steps */}
                    {selectedTemplate.definition.setup && selectedTemplate.definition.setup.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Setup ({selectedTemplate.definition.setup.length})</h4>
                        <div className="space-y-2">
                          {selectedTemplate.definition.setup.map((step, idx) => (
                            <div key={idx} className="p-2 bg-background rounded border">
                              <div className="font-medium text-xs">{step.name || step.id}</div>
                              <div className="text-[10px] text-muted-foreground">{step.action}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Main Steps */}
                    <div>
                      <h4 className="font-semibold text-sm mb-2">
                        Steps ({selectedTemplate.definition.steps.length})
                      </h4>
                      <div className="space-y-2">
                        {selectedTemplate.definition.steps.map((step, idx) => (
                          <div key={idx} className="p-2 bg-background rounded border">
                            <div className="font-medium text-xs">{step.name || step.id}</div>
                            <div className="text-[10px] text-muted-foreground">{step.action}</div>
                            {step.assert && step.assert.length > 0 && (
                              <div className="mt-1 flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                                <Check className="w-3 h-3" />
                                {step.assert.length} assertion{step.assert.length > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Teardown Steps */}
                    {selectedTemplate.definition.teardown && selectedTemplate.definition.teardown.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">
                          Teardown ({selectedTemplate.definition.teardown.length})
                        </h4>
                        <div className="space-y-2">
                          {selectedTemplate.definition.teardown.map((step, idx) => (
                            <div key={idx} className="p-2 bg-background rounded border">
                              <div className="font-medium text-xs">{step.name || step.id}</div>
                              <div className="text-[10px] text-muted-foreground">{step.action}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              /* Template Grid */
              <ScrollArea className="flex-1">
                {filteredTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Search className="w-12 h-12 text-muted-foreground mb-3" />
                    <h3 className="font-semibold mb-1">No templates found</h3>
                    <p className="text-sm text-muted-foreground">
                      Try adjusting your search or category filter
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4 pr-2">
                    {filteredTemplates.map((template) => {
                      const Icon = iconMap[template.icon] || FileText;

                      return (
                        <button
                          key={template.id}
                          onClick={() => setSelectedTemplate(template)}
                          className="flex flex-col items-start gap-2 p-4 border rounded-lg hover:border-primary transition-colors text-left group"
                        >
                          <div className="flex items-start justify-between w-full">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                              <Icon className="w-5 h-5" />
                            </div>
                            <Badge className={cn('text-xs', difficultyColors[template.difficulty])}>
                              {template.difficulty}
                            </Badge>
                          </div>

                          <div className="flex-1 w-full">
                            <h4 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">
                              {template.name}
                            </h4>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {template.description}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-1 w-full">
                            {template.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                            {template.tags.length > 3 && (
                              <Badge variant="outline" className="text-[10px]">
                                +{template.tags.length - 3}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span>{template.definition.steps.length} steps</span>
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
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          {selectedTemplate && (
            <Button onClick={handleApply} className="gap-2">
              Apply Template
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
