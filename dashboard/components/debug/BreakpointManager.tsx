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
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

  const stepBreakpoints = breakpoints.filter((bp) => bp.type === 'step' || bp.type === 'conditional');
  const errorBreakpoints = breakpoints.filter((bp) => bp.type === 'error');
  const assertionBreakpoints = breakpoints.filter((bp) => bp.type === 'assertion');

  const getStepInfo = (stepId: string) => steps.find((s) => s.id === stepId);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="p-2 border-b border-[#1a2332]">
        <Collapsible open={showAddForm} onOpenChange={setShowAddForm}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center gap-2 h-8 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors">
              <Plus className="w-3 h-3" />
              Add Breakpoint
              <ChevronRight className={cn('w-3 h-3 ml-auto transition-transform', showAddForm && 'rotate-90')} />
            </button>
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
                        {step.name && <span className="text-[#4a6480] ml-2">{step.name}</span>}
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

            <button
              onClick={handleAdd}
              disabled={(breakpointType === 'step' || breakpointType === 'conditional') && !selectedStep}
              className="w-full flex items-center justify-center h-8 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {stepBreakpoints.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-[#4a6480] uppercase tracking-wide px-1">
                Step Breakpoints
              </div>
              {stepBreakpoints.map((bp) => {
                const stepInfo = getStepInfo(bp.step_id || '');
                const isCurrent = bp.step_id === currentStep;
                return (
                  <div
                    key={bp.id}
                    className={cn(
                      'group flex items-center gap-2 p-2 rounded-md hover:bg-[#131b26] transition-colors',
                      isCurrent && 'bg-yellow-400/5'
                    )}
                  >
                    <button
                      onClick={() => onToggle(bp.id)}
                      className="shrink-0"
                      title={bp.enabled ? 'Disable' : 'Enable'}
                    >
                      {bp.enabled
                        ? <CircleDot className="w-4 h-4 text-red-400" />
                        : <Circle className="w-4 h-4 text-[#4a6480]" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs text-[#c8dce8] truncate">{bp.step_id}</span>
                        {bp.type === 'conditional' && (
                          <span className="text-[10px] text-purple-400">(conditional)</span>
                        )}
                      </div>
                      {stepInfo?.name && (
                        <div className="text-[10px] text-[#4a6480] truncate">{stepInfo.name}</div>
                      )}
                      {bp.condition && (
                        <div className="text-[10px] font-mono text-purple-400 truncate">
                          if: {bp.condition}
                        </div>
                      )}
                    </div>
                    {bp.hit_count > 0 && (
                      <span className="text-[10px] text-[#4a6480]">×{bp.hit_count}</span>
                    )}
                    <button
                      onClick={() => onRemove(bp.id)}
                      className="flex items-center justify-center h-6 w-6 rounded opacity-0 group-hover:opacity-100 text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {errorBreakpoints.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-[#4a6480] uppercase tracking-wide px-1">
                Error Breakpoints
              </div>
              {errorBreakpoints.map((bp) => (
                <div key={bp.id} className="group flex items-center gap-2 p-2 rounded-md hover:bg-[#131b26] transition-colors">
                  <button onClick={() => onToggle(bp.id)} className="shrink-0">
                    <AlertCircle className={cn('w-4 h-4', bp.enabled ? 'text-red-400' : 'text-[#4a6480]')} />
                  </button>
                  <div className="flex-1 text-xs text-[#c8dce8]">Break on any error</div>
                  <button
                    onClick={() => onRemove(bp.id)}
                    className="flex items-center justify-center h-6 w-6 rounded opacity-0 group-hover:opacity-100 text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {assertionBreakpoints.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-[#4a6480] uppercase tracking-wide px-1">
                Assertion Breakpoints
              </div>
              {assertionBreakpoints.map((bp) => (
                <div key={bp.id} className="group flex items-center gap-2 p-2 rounded-md hover:bg-[#131b26] transition-colors">
                  <button onClick={() => onToggle(bp.id)} className="shrink-0">
                    <FileWarning className={cn('w-4 h-4', bp.enabled ? 'text-amber-400' : 'text-[#4a6480]')} />
                  </button>
                  <div className="flex-1 text-xs text-[#c8dce8]">Break on assertion failure</div>
                  <button
                    onClick={() => onRemove(bp.id)}
                    className="flex items-center justify-center h-6 w-6 rounded opacity-0 group-hover:opacity-100 text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {breakpoints.length === 0 && (
            <div className="text-center py-8">
              <CircleDot className="w-8 h-8 mx-auto mb-2 text-[#3d5670]" />
              <p className="text-xs text-[#4a6480]">No breakpoints set</p>
              <p className="text-[10px] text-[#3d5670] mt-1">Add a breakpoint to pause execution</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
