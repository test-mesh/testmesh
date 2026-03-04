'use client';

import { useState } from 'react';
import {
  CircleDot,
  Circle,
  Plus,
  Trash2,
  AlertCircle,
  FileWarning,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Breakpoint {
  id: string;
  type: 'step' | 'conditional' | 'error' | 'assertion';
  step_id?: string;
  condition?: string;
  enabled: boolean;
  hit_count: number;
  log_point?: string;
}

interface StepInfo {
  id: string;
  name: string;
  action: string;
}

interface BreakpointManagerProps {
  steps: StepInfo[];
  breakpoints: Breakpoint[];
  currentStep?: string;
  onAdd: (stepId: string, type?: string, condition?: string) => void;
  onRemove: (breakpointId: string) => void;
  onToggle: (breakpointId: string) => void;
  className?: string;
}

export default function BreakpointManager({
  steps,
  breakpoints,
  currentStep,
  onAdd,
  onRemove,
  onToggle,
  className,
}: BreakpointManagerProps) {
  const [selectedStep, setSelectedStep] = useState<string>('');
  const [breakpointType, setBreakpointType] = useState<string>('step');
  const [condition, setCondition] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = () => {
    if (breakpointType === 'error' || breakpointType === 'assertion') {
      onAdd('', breakpointType);
    } else if (selectedStep) {
      onAdd(selectedStep, breakpointType, condition || undefined);
    }
    setShowAddForm(false);
    setSelectedStep('');
    setCondition('');
  };

  // Group breakpoints by type
  const stepBreakpoints = breakpoints.filter((bp) => bp.type === 'step' || bp.type === 'conditional');
  const errorBreakpoints = breakpoints.filter((bp) => bp.type === 'error');
  const assertionBreakpoints = breakpoints.filter((bp) => bp.type === 'assertion');

  const getStepInfo = (stepId: string) => steps.find((s) => s.id === stepId);

  const BreakpointTypeIcon = ({ type }: { type: string }) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      case 'assertion':
        return <FileWarning className="w-3 h-3 text-amber-500" />;
      case 'conditional':
        return <CircleDot className="w-3 h-3 text-purple-500" />;
      default:
        return <CircleDot className="w-3 h-3 text-blue-500" />;
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Add Breakpoint */}
      <div className="p-2 border-b">
        <Collapsible open={showAddForm} onOpenChange={setShowAddForm}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-start h-8">
              <Plus className="w-3 h-3 mr-2" />
              Add Breakpoint
              <ChevronRight
                className={cn('w-3 h-3 ml-auto transition-transform', showAddForm && 'rotate-90')}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            <div className="space-y-2">
              <Label className="text-xs">Type</Label>
              <Select value={breakpointType} onValueChange={setBreakpointType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="step" className="text-xs">Step Breakpoint</SelectItem>
                  <SelectItem value="conditional" className="text-xs">Conditional</SelectItem>
                  <SelectItem value="error" className="text-xs">Break on Error</SelectItem>
                  <SelectItem value="assertion" className="text-xs">Break on Assertion Failure</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(breakpointType === 'step' || breakpointType === 'conditional') && (
              <div className="space-y-2">
                <Label className="text-xs">Step</Label>
                <Select value={selectedStep} onValueChange={setSelectedStep}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select step..." />
                  </SelectTrigger>
                  <SelectContent>
                    {steps.map((step) => (
                      <SelectItem key={step.id} value={step.id} className="text-xs">
                        <span className="font-mono">{step.id}</span>
                        {step.name && <span className="text-muted-foreground ml-2">{step.name}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {breakpointType === 'conditional' && (
              <div className="space-y-2">
                <Label className="text-xs">Condition</Label>
                <Input
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  placeholder="e.g., ${counter} > 5"
                  className="h-8 text-xs font-mono"
                />
              </div>
            )}

            <Button
              size="sm"
              onClick={handleAdd}
              disabled={
                (breakpointType === 'step' || breakpointType === 'conditional') && !selectedStep
              }
              className="w-full h-8"
            >
              Add
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Breakpoint List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {/* Step Breakpoints */}
          {stepBreakpoints.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase px-1">
                Step Breakpoints
              </div>
              {stepBreakpoints.map((bp) => {
                const stepInfo = getStepInfo(bp.step_id || '');
                const isCurrent = bp.step_id === currentStep;

                return (
                  <div
                    key={bp.id}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors',
                      isCurrent && 'bg-yellow-50 dark:bg-yellow-950/30'
                    )}
                  >
                    <button
                      onClick={() => onToggle(bp.id)}
                      className="shrink-0"
                      title={bp.enabled ? 'Disable' : 'Enable'}
                    >
                      {bp.enabled ? (
                        <CircleDot className="w-4 h-4 text-red-500" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs truncate">
                          {bp.step_id}
                        </span>
                        {bp.type === 'conditional' && (
                          <span className="text-[10px] text-purple-500">(conditional)</span>
                        )}
                      </div>
                      {stepInfo?.name && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {stepInfo.name}
                        </div>
                      )}
                      {bp.condition && (
                        <div className="text-[10px] font-mono text-purple-600 truncate">
                          if: {bp.condition}
                        </div>
                      )}
                    </div>
                    {bp.hit_count > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        ×{bp.hit_count}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(bp.id)}
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Error Breakpoints */}
          {errorBreakpoints.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase px-1">
                Error Breakpoints
              </div>
              {errorBreakpoints.map((bp) => (
                <div
                  key={bp.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50"
                >
                  <button onClick={() => onToggle(bp.id)} className="shrink-0">
                    {bp.enabled ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1 text-xs">Break on any error</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(bp.id)}
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Assertion Breakpoints */}
          {assertionBreakpoints.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase px-1">
                Assertion Breakpoints
              </div>
              {assertionBreakpoints.map((bp) => (
                <div
                  key={bp.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50"
                >
                  <button onClick={() => onToggle(bp.id)} className="shrink-0">
                    {bp.enabled ? (
                      <FileWarning className="w-4 h-4 text-amber-500" />
                    ) : (
                      <FileWarning className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1 text-xs">Break on assertion failure</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(bp.id)}
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {breakpoints.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <CircleDot className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No breakpoints set</p>
              <p className="text-[10px] mt-1">
                Add a breakpoint to pause execution
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
