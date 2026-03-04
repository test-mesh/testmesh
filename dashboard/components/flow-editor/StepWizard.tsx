'use client';

import { useState } from 'react';
import {
  Globe,
  Database,
  MessageSquare,
  FileText,
  Clock,
  CheckCircle,
  Wand2,
  GitBranch,
  Repeat,
  Server,
  ServerOff,
  FileCode,
  FileCheck,
  Zap,
  ArrowRight,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ActionType, FlowNodeData } from './types';

// Forms
import HTTPStepForm from './forms/HTTPStepForm';
import DatabaseStepForm from './forms/DatabaseStepForm';
import KafkaStepForm from './forms/KafkaStepForm';
import AssertionBuilder from './forms/AssertionBuilder';

interface StepWizardProps {
  open: boolean;
  onClose: () => void;
  onSave: (stepData: Partial<FlowNodeData>) => void;
  initialData?: Partial<FlowNodeData>;
  mode?: 'create' | 'edit';
  variables?: Record<string, string>;
  stepOutputs?: Record<string, Record<string, unknown>>;
}

interface StepTypeOption {
  type: ActionType;
  label: string;
  description: string;
  icon: React.ElementType;
  category: 'protocol' | 'logic' | 'mock' | 'contract';
  color: string;
}

const STEP_TYPES: StepTypeOption[] = [
  // Protocol actions
  {
    type: 'http_request',
    label: 'HTTP Request',
    description: 'Make REST API calls with full control over method, headers, and body',
    icon: Globe,
    category: 'protocol',
    color: 'text-blue-500',
  },
  {
    type: 'database_query',
    label: 'Database Query',
    description: 'Execute SQL queries against PostgreSQL, MySQL, or SQLite',
    icon: Database,
    category: 'protocol',
    color: 'text-purple-500',
  },
  // Note: Kafka uses plugin system, represented as custom type here
  {
    type: 'log' as ActionType, // We'll use 'kafka' but map through plugin
    label: 'Kafka Message',
    description: 'Produce or consume messages from Kafka topics',
    icon: MessageSquare,
    category: 'protocol',
    color: 'text-orange-500',
  },
  // Logic actions
  {
    type: 'log',
    label: 'Log',
    description: 'Output debug messages to the execution log',
    icon: FileText,
    category: 'logic',
    color: 'text-gray-500',
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Pause execution for a specified duration',
    icon: Clock,
    category: 'logic',
    color: 'text-yellow-500',
  },
  {
    type: 'assert',
    label: 'Assert',
    description: 'Validate conditions and fail if not met',
    icon: CheckCircle,
    category: 'logic',
    color: 'text-green-500',
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Transform data between steps using expressions',
    icon: Wand2,
    category: 'logic',
    color: 'text-pink-500',
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch execution based on conditions',
    icon: GitBranch,
    category: 'logic',
    color: 'text-cyan-500',
  },
  {
    type: 'for_each',
    label: 'For Each',
    description: 'Loop over arrays and execute nested steps',
    icon: Repeat,
    category: 'logic',
    color: 'text-indigo-500',
  },
  // Mock actions
  {
    type: 'mock_server_start',
    label: 'Start Mock Server',
    description: 'Start a mock HTTP server for testing',
    icon: Server,
    category: 'mock',
    color: 'text-emerald-500',
  },
  {
    type: 'mock_server_stop',
    label: 'Stop Mock Server',
    description: 'Stop a running mock server',
    icon: ServerOff,
    category: 'mock',
    color: 'text-red-500',
  },
  // Contract actions
  {
    type: 'contract_generate',
    label: 'Generate Contract',
    description: 'Record API interactions to generate contracts',
    icon: FileCode,
    category: 'contract',
    color: 'text-amber-500',
  },
  {
    type: 'contract_verify',
    label: 'Verify Contract',
    description: 'Verify provider compliance with contracts',
    icon: FileCheck,
    category: 'contract',
    color: 'text-lime-500',
  },
];

const CATEGORIES = [
  { id: 'protocol', label: 'Protocol', description: 'HTTP, Database, Messaging' },
  { id: 'logic', label: 'Logic', description: 'Control flow and utilities' },
  { id: 'mock', label: 'Mock', description: 'Mock servers and stubs' },
  { id: 'contract', label: 'Contract', description: 'Contract testing' },
];

export default function StepWizard({
  open,
  onClose,
  onSave,
  initialData,
  mode = 'create',
  variables = {},
  stepOutputs = {},
}: StepWizardProps) {
  const [step, setStep] = useState<'type' | 'config' | 'assertions'>(
    mode === 'edit' && initialData?.action ? 'config' : 'type'
  );
  const [selectedType, setSelectedType] = useState<ActionType | null>(
    initialData?.action || null
  );
  const [stepData, setStepData] = useState<Partial<FlowNodeData>>(
    initialData || {
      stepId: '',
      name: '',
      config: {},
      assert: [],
      output: {},
    }
  );

  const handleTypeSelect = (type: ActionType) => {
    setSelectedType(type);
    setStepData((prev) => ({
      ...prev,
      action: type,
      config: {},
    }));
    setStep('config');
  };

  const handleConfigChange = (key: string, value: unknown) => {
    setStepData((prev) => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }));
  };

  const handleSave = () => {
    if (!selectedType || !stepData.stepId) return;

    onSave({
      ...stepData,
      action: selectedType,
      label: stepData.name || stepData.stepId,
    });
    onClose();
  };

  const selectedTypeInfo = STEP_TYPES.find((t) => t.type === selectedType);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step !== 'type' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(step === 'assertions' ? 'config' : 'type')}
                className="h-6 w-6 p-0 mr-1"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            {step === 'type' && 'Add Step'}
            {step === 'config' && (
              <>
                {selectedTypeInfo && (
                  <selectedTypeInfo.icon className={cn('w-5 h-5', selectedTypeInfo.color)} />
                )}
                Configure {selectedTypeInfo?.label}
              </>
            )}
            {step === 'assertions' && 'Add Assertions'}
          </DialogTitle>
          <DialogDescription>
            {step === 'type' && 'Choose the type of step to add to your flow'}
            {step === 'config' && 'Configure the step settings'}
            {step === 'assertions' && 'Add validation assertions for this step'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {/* Step Type Selection */}
          {step === 'type' && (
            <div className="space-y-6">
              {CATEGORIES.map((category) => {
                const categoryTypes = STEP_TYPES.filter((t) => t.category === category.id);
                return (
                  <div key={category.id}>
                    <h3 className="text-sm font-medium mb-2">{category.label}</h3>
                    <p className="text-xs text-muted-foreground mb-3">{category.description}</p>
                    <div className="grid grid-cols-3 gap-3">
                      {categoryTypes.map((typeOption) => (
                        <button
                          key={typeOption.type}
                          onClick={() => handleTypeSelect(typeOption.type)}
                          className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className={cn('p-2 rounded-md bg-muted', typeOption.color)}>
                            <typeOption.icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{typeOption.label}</div>
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {typeOption.description}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Configuration */}
          {step === 'config' && selectedType && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4 pb-4 border-b">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Step ID *</Label>
                    <Input
                      value={stepData.stepId || ''}
                      onChange={(e) => setStepData((prev) => ({ ...prev, stepId: e.target.value }))}
                      placeholder="unique_step_id"
                      className="h-9 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={stepData.name || ''}
                      onChange={(e) => setStepData((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Human readable name"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={stepData.description || ''}
                    onChange={(e) => setStepData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description of what this step does"
                    className="resize-none text-sm"
                    rows={2}
                  />
                </div>
              </div>

              {/* Type-specific config */}
              <div className="space-y-4">
                {selectedType === 'http_request' && (
                  <HTTPStepForm
                    config={stepData.config || {}}
                    onChange={handleConfigChange}
                    variables={variables}
                    stepOutputs={stepOutputs}
                  />
                )}

                {selectedType === 'database_query' && (
                  <DatabaseStepForm
                    config={stepData.config || {}}
                    onChange={handleConfigChange}
                    variables={variables}
                    stepOutputs={stepOutputs}
                  />
                )}

                {/* Kafka (shown when 'log' is selected as placeholder for kafka plugin) */}
                {selectedTypeInfo?.label === 'Kafka Message' && (
                  <KafkaStepForm
                    config={stepData.config || {}}
                    onChange={handleConfigChange}
                    variables={variables}
                    stepOutputs={stepOutputs}
                  />
                )}

                {/* Basic configs for other types */}
                {selectedType === 'log' && selectedTypeInfo?.label !== 'Kafka Message' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Message</Label>
                      <Textarea
                        value={(stepData.config?.message as string) || ''}
                        onChange={(e) => handleConfigChange('message', e.target.value)}
                        placeholder="Log message with ${variables}"
                        className="text-sm resize-none"
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {selectedType === 'delay' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Duration</Label>
                      <Input
                        value={(stepData.config?.duration as string) || ''}
                        onChange={(e) => handleConfigChange('duration', e.target.value)}
                        placeholder="1s, 500ms, 2m"
                        className="h-9"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Examples: 100ms, 5s, 1m
                      </p>
                    </div>
                  </div>
                )}

                {/* Add more type configs as needed */}
              </div>
            </div>
          )}

          {/* Assertions */}
          {step === 'assertions' && (
            <AssertionBuilder
              assertions={stepData.assert || []}
              onChange={(assertions) => setStepData((prev) => ({ ...prev, assert: assertions }))}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {step === 'config' && (
              <Button
                variant="outline"
                onClick={() => setStep('assertions')}
              >
                Add Assertions
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {(step === 'config' || step === 'assertions') && (
              <Button
                onClick={handleSave}
                disabled={!selectedType || !stepData.stepId}
              >
                <Zap className="w-4 h-4 mr-2" />
                {mode === 'create' ? 'Add Step' : 'Save Changes'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
