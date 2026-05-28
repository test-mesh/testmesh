'use client';

import { AlertTriangle, Plus, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

export interface ErrorHandlingConfig {
  on_error?: 'fail' | 'continue' | 'retry';
  error_steps?: ErrorStep[];
  on_timeout?: ErrorStep[];
}

export interface ErrorStep {
  id: string;
  action: string;
  config: Record<string, any>;
}

interface ErrorHandlingPanelProps {
  value: ErrorHandlingConfig;
  onChange: (value: ErrorHandlingConfig) => void;
  className?: string;
}

export default function ErrorHandlingPanel({
  value,
  onChange,
  className,
}: ErrorHandlingPanelProps) {
  const handleOnErrorChange = (onError: string) => {
    onChange({ ...value, on_error: onError as 'fail' | 'continue' | 'retry' });
  };

  const addErrorStep = () => {
    const newStep: ErrorStep = {
      id: `error_step_${Date.now()}`,
      action: 'log',
      config: { message: 'Error occurred: ${error.message}' },
    };
    onChange({
      ...value,
      error_steps: [...(value.error_steps || []), newStep],
    });
  };

  const updateErrorStep = (index: number, updates: Partial<ErrorStep>) => {
    const newSteps = [...(value.error_steps || [])];
    newSteps[index] = { ...newSteps[index], ...updates };
    onChange({ ...value, error_steps: newSteps });
  };

  const removeErrorStep = (index: number) => {
    const newSteps = (value.error_steps || []).filter((_, i) => i !== index);
    onChange({ ...value, error_steps: newSteps.length > 0 ? newSteps : undefined });
  };

  const addTimeoutStep = () => {
    const newStep: ErrorStep = {
      id: `timeout_step_${Date.now()}`,
      action: 'log',
      config: { message: 'Operation timed out' },
    };
    onChange({
      ...value,
      on_timeout: [...(value.on_timeout || []), newStep],
    });
  };

  const updateTimeoutStep = (index: number, updates: Partial<ErrorStep>) => {
    const newSteps = [...(value.on_timeout || [])];
    newSteps[index] = { ...newSteps[index], ...updates };
    onChange({ ...value, on_timeout: newSteps });
  };

  const removeTimeoutStep = (index: number) => {
    const newSteps = (value.on_timeout || []).filter((_, i) => i !== index);
    onChange({ ...value, on_timeout: newSteps.length > 0 ? newSteps : undefined });
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <Label>Error Handling</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="on_error">When Step Fails</Label>
        <Select
          value={value.on_error || 'fail'}
          onValueChange={handleOnErrorChange}
        >
          <SelectTrigger id="on_error">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fail">
              <div>
                <div className="font-medium">Fail Flow</div>
                <div className="text-xs text-[#4a6480]">
                  Stop execution and mark flow as failed
                </div>
              </div>
            </SelectItem>
            <SelectItem value="continue">
              <div>
                <div className="font-medium">Continue</div>
                <div className="text-xs text-[#4a6480]">
                  Continue to next step despite error
                </div>
              </div>
            </SelectItem>
            <SelectItem value="retry">
              <div>
                <div className="font-medium">Retry</div>
                <div className="text-xs text-[#4a6480]">
                  Use retry configuration to retry this step
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Accordion type="single" collapsible className="border border-[#1e2d3d] rounded-lg">
        <AccordionItem value="error_steps" className="border-none">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#c8dce8]">Error Steps</span>
              {value.error_steps && value.error_steps.length > 0 && (
                <span className="text-xs px-2 py-0.5 bg-amber-400/10 text-amber-400 rounded-full">
                  {value.error_steps.length}
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-3">
              <p className="text-xs text-[#4a6480]">
                Steps to execute when this step fails (before flow fails or continues)
              </p>

              {value.error_steps && value.error_steps.length > 0 ? (
                <div className="space-y-2">
                  {value.error_steps.map((step, index) => (
                    <div
                      key={step.id}
                      className="p-3 border border-[#1a2332] rounded-lg bg-[#0b0f18] space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <Select
                            value={step.action}
                            onValueChange={(action) => updateErrorStep(index, { action })}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="log">Log Message</SelectItem>
                              <SelectItem value="http_request">HTTP Request</SelectItem>
                              <SelectItem value="database_query">Database Query</SelectItem>
                            </SelectContent>
                          </Select>

                          {step.action === 'log' && (
                            <Input
                              value={(step.config.message as string) || ''}
                              onChange={(e) =>
                                updateErrorStep(index, {
                                  config: { ...step.config, message: e.target.value },
                                })
                              }
                              placeholder="Error message..."
                              className="text-sm"
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeErrorStep(index)}
                          className="flex items-center justify-center h-8 w-8 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 border border-dashed border-[#1e2d3d] rounded-lg">
                  <p className="text-xs text-[#4a6480]">No error steps defined</p>
                </div>
              )}

              <button
                type="button"
                onClick={addErrorStep}
                className="flex items-center justify-center gap-2 w-full h-8 rounded-lg border border-dashed border-[#1e2d3d] text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:border-[#2a3d52] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Error Step
              </button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Accordion type="single" collapsible className="border border-[#1e2d3d] rounded-lg">
        <AccordionItem value="timeout_steps" className="border-none">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#c8dce8]">Timeout Steps</span>
              {value.on_timeout && value.on_timeout.length > 0 && (
                <span className="text-xs px-2 py-0.5 bg-amber-400/10 text-amber-400 rounded-full">
                  {value.on_timeout.length}
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-3">
              <p className="text-xs text-[#4a6480]">
                Steps to execute when this step times out
              </p>

              {value.on_timeout && value.on_timeout.length > 0 ? (
                <div className="space-y-2">
                  {value.on_timeout.map((step, index) => (
                    <div
                      key={step.id}
                      className="p-3 border border-[#1a2332] rounded-lg bg-[#0b0f18] space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <Select
                            value={step.action}
                            onValueChange={(action) => updateTimeoutStep(index, { action })}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="log">Log Message</SelectItem>
                              <SelectItem value="http_request">HTTP Request</SelectItem>
                              <SelectItem value="database_query">Database Query</SelectItem>
                            </SelectContent>
                          </Select>

                          {step.action === 'log' && (
                            <Input
                              value={(step.config.message as string) || ''}
                              onChange={(e) =>
                                updateTimeoutStep(index, {
                                  config: { ...step.config, message: e.target.value },
                                })
                              }
                              placeholder="Timeout message..."
                              className="text-sm"
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTimeoutStep(index)}
                          className="flex items-center justify-center h-8 w-8 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 border border-dashed border-[#1e2d3d] rounded-lg">
                  <p className="text-xs text-[#4a6480]">No timeout steps defined</p>
                </div>
              )}

              <button
                type="button"
                onClick={addTimeoutStep}
                className="flex items-center justify-center gap-2 w-full h-8 rounded-lg border border-dashed border-[#1e2d3d] text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:border-[#2a3d52] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Timeout Step
              </button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
