'use client';

import { useState } from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  const [showErrorSteps, setShowErrorSteps] = useState(false);
  const [showTimeoutSteps, setShowTimeoutSteps] = useState(false);

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
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <Label>Error Handling</Label>
      </div>

      {/* On Error Behavior */}
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
                <div className="text-xs text-muted-foreground">
                  Stop execution and mark flow as failed
                </div>
              </div>
            </SelectItem>
            <SelectItem value="continue">
              <div>
                <div className="font-medium">Continue</div>
                <div className="text-xs text-muted-foreground">
                  Continue to next step despite error
                </div>
              </div>
            </SelectItem>
            <SelectItem value="retry">
              <div>
                <div className="font-medium">Retry</div>
                <div className="text-xs text-muted-foreground">
                  Use retry configuration to retry this step
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error Steps */}
      <Accordion type="single" collapsible className="border rounded-lg">
        <AccordionItem value="error_steps" className="border-none">
          <AccordionTrigger
            className="px-4 hover:no-underline"
            onClick={() => setShowErrorSteps(!showErrorSteps)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Error Steps</span>
              {value.error_steps && value.error_steps.length > 0 && (
                <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                  {value.error_steps.length}
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Steps to execute when this step fails (before flow fails or continues)
              </p>

              {value.error_steps && value.error_steps.length > 0 ? (
                <div className="space-y-2">
                  {value.error_steps.map((step, index) => (
                    <div
                      key={step.id}
                      className="p-3 border rounded-lg bg-muted/30 space-y-2"
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeErrorStep(index)}
                          className="h-8 w-8 p-0 text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 border-2 border-dashed rounded-lg">
                  <p className="text-xs text-muted-foreground">No error steps defined</p>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addErrorStep}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Error Step
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Timeout Steps */}
      <Accordion type="single" collapsible className="border rounded-lg">
        <AccordionItem value="timeout_steps" className="border-none">
          <AccordionTrigger
            className="px-4 hover:no-underline"
            onClick={() => setShowTimeoutSteps(!showTimeoutSteps)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Timeout Steps</span>
              {value.on_timeout && value.on_timeout.length > 0 && (
                <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                  {value.on_timeout.length}
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Steps to execute when this step times out
              </p>

              {value.on_timeout && value.on_timeout.length > 0 ? (
                <div className="space-y-2">
                  {value.on_timeout.map((step, index) => (
                    <div
                      key={step.id}
                      className="p-3 border rounded-lg bg-muted/30 space-y-2"
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTimeoutStep(index)}
                          className="h-8 w-8 p-0 text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 border-2 border-dashed rounded-lg">
                  <p className="text-xs text-muted-foreground">No timeout steps defined</p>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTimeoutStep}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Timeout Step
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
