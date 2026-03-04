'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Save,
  Undo,
  Redo,
  Play,
  Code,
  LayoutGrid,
  Settings2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Search,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { FlowDefinition } from '@/lib/api/types';
import type { FlowNode, FlowNodeData, PaletteItem } from './types';
import { flowDefinitionToYaml, flowDefinitionToNodesAndEdges, nodesAndEdgesToFlowDefinition } from './utils';
import { applyAutoLayout } from './layout';

import FlowCanvas from './FlowCanvas';
import NodePalette from './NodePalette';
import PropertiesPanel from './PropertiesPanel';
import SearchPanel from './SearchPanel';
import ValidationPanel from './ValidationPanel';
import FlowConfigDialog from './FlowConfigDialog';
import ExportDialog from './ExportDialog';
import TemplatesDialog from './TemplatesDialog';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';
import { validateFlow, type ValidationResult } from './validation';

interface FlowEditorProps {
  initialDefinition?: FlowDefinition;
  initialYaml?: string;
  onSave?: (yaml: string, definition: FlowDefinition) => void;
  onRun?: (definition: FlowDefinition) => void;
  isSaving?: boolean;
  isRunning?: boolean;
  className?: string;
}

// Simple YAML parser for flow definitions
// Supports both root-level and `flow:` wrapped structures
function parseYaml(yaml: string): FlowDefinition | null {
  try {
    const lines = yaml.split('\n');
    const definition: Partial<FlowDefinition> = {
      name: '',
      description: '',
      suite: '',
      tags: [],
      steps: [],
    };

    let currentSection: 'root' | 'env' | 'default_retry' | 'setup' | 'steps' | 'teardown' = 'root';
    let currentStep: any = null;
    let currentKey = '';

    // Detect if YAML uses `flow:` wrapper (indent offset)
    let baseIndent = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed === 'flow:') {
        baseIndent = 2; // Properties are nested under flow:
        break;
      }
      // If first non-comment line is not `flow:`, assume root-level
      break;
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed === 'flow:') continue; // Skip the wrapper line

      // Calculate indent level relative to base
      const lineIndent = line.search(/\S/) - baseIndent;

      // Parse key-value pairs
      const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        const [, key, value] = kvMatch;

        if (lineIndent === 0) {
          // Root level (flow properties)
          switch (key) {
            case 'name':
              definition.name = value.replace(/^["']|["']$/g, '');
              break;
            case 'description':
              definition.description = value.replace(/^["']|["']$/g, '');
              break;
            case 'suite':
              definition.suite = value.replace(/^["']|["']$/g, '');
              break;
            case 'tags':
              if (value.startsWith('[')) {
                definition.tags = JSON.parse(value.replace(/'/g, '"'));
              }
              break;
            case 'env':
              currentSection = 'env';
              definition.env = {};
              break;
            case 'default_timeout':
              (definition as any).default_timeout = value.replace(/^["']|["']$/g, '');
              break;
            case 'default_retry':
              (definition as any).default_retry = {};
              currentSection = 'default_retry' as any;
              break;
            case 'fail_fast':
              (definition as any).fail_fast = value === 'true';
              break;
            case 'continue_on_error':
              (definition as any).continue_on_error = value === 'true';
              break;
            case 'setup':
              currentSection = 'setup';
              definition.setup = [];
              break;
            case 'steps':
              currentSection = 'steps';
              definition.steps = [];
              break;
            case 'teardown':
              currentSection = 'teardown';
              definition.teardown = [];
              break;
          }
        } else if (currentSection === 'env' && lineIndent === 2) {
          definition.env = definition.env || {};
          definition.env[key] = value.replace(/^["']|["']$/g, '');
        } else if (currentSection === 'default_retry' && lineIndent === 2) {
          const defAny = definition as any;
          defAny.default_retry = defAny.default_retry || {};
          if (key === 'max_attempts') {
            defAny.default_retry.max_attempts = parseInt(value);
          } else if (key === 'delay') {
            defAny.default_retry.delay = value.replace(/^["']|["']$/g, '');
          } else if (key === 'backoff') {
            defAny.default_retry.backoff = value.replace(/^["']|["']$/g, '');
          }
        } else if (currentStep && ['setup', 'steps', 'teardown'].includes(currentSection)) {
          // Step properties
          if (key === 'config') {
            currentStep.config = {};
            currentKey = 'config';
          } else if (key === 'assert') {
            currentStep.assert = [];
            currentKey = 'assert';
          } else if (key === 'output') {
            currentStep.output = {};
            currentKey = 'output';
          } else if (currentKey === 'config') {
            currentStep.config[key] = value.replace(/^["']|["']$/g, '');
          } else if (currentKey === 'output') {
            currentStep.output[key] = value.replace(/^["']|["']$/g, '');
          } else {
            currentStep[key] = value.replace(/^["']|["']$/g, '');
          }
        }
      }

      // Parse list items
      const listMatch = trimmed.match(/^-\s*(.+)$/);
      if (listMatch) {
        const listValue = listMatch[1];

        if (['setup', 'steps', 'teardown'].includes(currentSection)) {
          if (listValue.startsWith('id:')) {
            // New step
            if (currentStep) {
              const targetArray = definition[currentSection as 'setup' | 'steps' | 'teardown'];
              if (targetArray) {
                targetArray.push(currentStep);
              }
            }
            currentStep = {
              id: listValue.replace('id:', '').trim(),
              config: {},
            };
            currentKey = '';
          } else if (currentKey === 'assert') {
            currentStep.assert = currentStep.assert || [];
            currentStep.assert.push(listValue);
          }
        }
      }
    }

    // Add last step
    if (currentStep && ['setup', 'steps', 'teardown'].includes(currentSection)) {
      const targetArray = definition[currentSection as 'setup' | 'steps' | 'teardown'];
      if (targetArray) {
        targetArray.push(currentStep);
      }
    }

    return definition as FlowDefinition;
  } catch (error) {
    console.error('YAML parsing error:', error);
    return null;
  }
}

export default function FlowEditor({
  initialDefinition,
  initialYaml,
  onSave,
  onRun,
  isSaving = false,
  isRunning = false,
  className,
}: FlowEditorProps) {
  // Editor mode: 'visual' or 'yaml'
  const [mode, setMode] = useState<'visual' | 'yaml'>('visual');

  // Flow definition state
  const [definition, setDefinition] = useState<FlowDefinition>(
    initialDefinition || {
      name: 'Untitled Flow',
      description: '',
      suite: '',
      tags: [],
      steps: [],
    }
  );

  // YAML state (for yaml mode)
  const [yaml, setYaml] = useState(initialYaml || '');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);

  // UI state
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // History for undo/redo
  const [history, setHistory] = useState<FlowDefinition[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Sync YAML when switching modes
  useEffect(() => {
    if (mode === 'yaml' && definition) {
      setYaml(flowDefinitionToYaml(definition));
    }
  }, [mode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs/textareas
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // ?: Show keyboard shortcuts (works anywhere)
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }

      // Cmd/Ctrl+F: Toggle search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && mode === 'visual' && !isInput) {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }

      // Escape: Close search or shortcuts
      if (e.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
        } else if (showSearch) {
          setShowSearch(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, showSearch, showShortcuts]);

  // Auto-validate flow when definition changes
  useEffect(() => {
    if (mode === 'visual' && definition) {
      const { nodes } = flowDefinitionToNodesAndEdges(definition);
      const result = validateFlow(definition, nodes);
      setValidationResult(result);

      // Auto-show validation panel if there are errors
      if (!result.valid && result.errorCount > 0) {
        setShowValidation(true);
      }
    }
  }, [definition, mode]);

  // Handle mode switch
  const handleModeChange = useCallback((newMode: string) => {
    setValidationSuccess(null);
    if (newMode === 'yaml') {
      // Visual → YAML: Generate YAML from definition
      setYaml(flowDefinitionToYaml(definition));
      setYamlError(null);
    } else {
      // YAML → Visual: Parse YAML to definition
      const parsed = parseYaml(yaml);
      if (parsed) {
        setDefinition(parsed);
        setYamlError(null);
      } else {
        setYamlError('Invalid YAML syntax. Please fix before switching to visual mode.');
        return; // Don't switch modes
      }
    }
    setMode(newMode as 'visual' | 'yaml');
  }, [definition, yaml]);

  // Handle definition changes (from visual editor)
  const handleDefinitionChange = useCallback((newDefinition: FlowDefinition) => {
    setDefinition(newDefinition);
    setIsDirty(true);

    // Add to history
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), newDefinition]);
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // Handle YAML changes
  const handleYamlChange = useCallback((newYaml: string) => {
    setYaml(newYaml);
    setIsDirty(true);
    setYamlError(null);

    // Try to parse for validation
    const parsed = parseYaml(newYaml);
    if (!parsed) {
      setYamlError('Invalid YAML syntax');
    }
    setValidationSuccess(null);
  }, []);

  // Handle validate YAML
  const handleValidate = useCallback(() => {
    setYamlError(null);
    setValidationSuccess(null);

    const parsed = parseYaml(yaml);
    if (!parsed) {
      setYamlError('Invalid YAML syntax');
      return;
    }

    // Check required fields
    const errors: string[] = [];
    if (!parsed.name || parsed.name === 'Untitled Flow') {
      errors.push('Flow name is required');
    }
    if (!parsed.steps || parsed.steps.length === 0) {
      errors.push('At least one step is required');
    }

    // Check each step has required fields
    parsed.steps?.forEach((step, index) => {
      if (!step.id) {
        errors.push(`Step ${index + 1}: missing 'id'`);
      }
      if (!step.action) {
        errors.push(`Step ${index + 1} (${step.id || 'unnamed'}): missing 'action'`);
      }
    });

    if (errors.length > 0) {
      setYamlError(`Validation failed:\n• ${errors.join('\n• ')}`);
    } else {
      setValidationSuccess(`Valid! Flow "${parsed.name}" with ${parsed.steps?.length || 0} steps`);
    }
  }, [yaml]);

  // Handle node selection
  const handleNodeSelect = useCallback((node: FlowNode | null) => {
    setSelectedNode(node);
    if (node) {
      setShowProperties(true);
    }
  }, []);

  // Handle node update from properties panel
  const handleNodeUpdate = useCallback((nodeId: string, data: Partial<FlowNodeData>) => {
    // Update the definition based on node changes
    setDefinition((prev) => {
      const updateSteps = (steps: any[] | undefined) => {
        if (!steps) return steps;
        return steps.map((step) => {
          if (step.id === data.stepId || step.id === nodeId) {
            return {
              ...step,
              ...data,
              id: data.stepId || step.id,
            };
          }
          return step;
        });
      };

      return {
        ...prev,
        setup: updateSteps(prev.setup),
        steps: updateSteps(prev.steps) || [],
        teardown: updateSteps(prev.teardown),
      };
    });
    setIsDirty(true);
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    let finalYaml = yaml;
    let finalDefinition = definition;

    if (mode === 'visual') {
      finalYaml = flowDefinitionToYaml(definition);
    } else {
      const parsed = parseYaml(yaml);
      if (parsed) {
        finalDefinition = parsed;
      } else {
        setYamlError('Cannot save: Invalid YAML syntax');
        return;
      }
    }

    onSave?.(finalYaml, finalDefinition);
    setIsDirty(false);
  }, [mode, yaml, definition, onSave]);

  // Handle run
  const handleRun = useCallback(() => {
    let finalDefinition = definition;

    if (mode === 'yaml') {
      const parsed = parseYaml(yaml);
      if (parsed) {
        finalDefinition = parsed;
      } else {
        setYamlError('Cannot run: Invalid YAML syntax');
        return;
      }
    }

    onRun?.(finalDefinition);
  }, [mode, yaml, definition, onRun]);

  // Undo/Redo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex((prev) => prev - 1);
      setDefinition(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex((prev) => prev + 1);
      setDefinition(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Handle template application
  const handleApplyTemplate = useCallback((templateDefinition: FlowDefinition) => {
    setDefinition(templateDefinition);
    setIsDirty(true);

    // Add to history
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), templateDefinition]);
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // Handle auto-layout
  const handleAutoLayout = useCallback(() => {
    if (mode !== 'visual') return;

    // Convert current definition to nodes and edges
    const { nodes, edges } = flowDefinitionToNodesAndEdges(definition);

    // Filter out section headers
    const flowNodes = nodes.filter((n) => n.type === 'flowNode');

    if (flowNodes.length === 0) return;

    // Apply auto-layout
    const layoutedNodes = applyAutoLayout(flowNodes, edges);

    // Merge back with section headers
    const allNodes = [
      ...nodes.filter((n) => n.type === 'sectionHeader'),
      ...layoutedNodes,
    ];

    // Convert back to definition
    const layoutedDefinition = nodesAndEdgesToFlowDefinition(allNodes as FlowNode[], edges, definition);

    // Update definition
    setDefinition(layoutedDefinition);
    setIsDirty(true);

    // Add to history
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), layoutedDefinition]);
    setHistoryIndex((prev) => prev + 1);
  }, [mode, definition, historyIndex]);

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {/* Mode Tabs */}
          <Tabs value={mode} onValueChange={handleModeChange}>
            <TabsList className="h-8">
              <TabsTrigger value="visual" className="text-xs px-3 h-7">
                <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
                Visual
              </TabsTrigger>
              <TabsTrigger value="yaml" className="text-xs px-3 h-7">
                <Code className="w-3.5 h-3.5 mr-1.5" />
                YAML
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="w-px h-6 bg-border mx-2" />

          {/* Templates */}
          <TemplatesDialog onApplyTemplate={handleApplyTemplate} />

          <div className="w-px h-6 bg-border mx-2" />

          {/* Flow Settings */}
          <FlowConfigDialog
            definition={definition}
            onChange={(newDef) => {
              setDefinition(newDef);
              setIsDirty(true);
            }}
          />

          <div className="w-px h-6 bg-border mx-2" />

          {/* Undo/Redo */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            disabled={!canUndo}
            className="h-8 w-8 p-0"
          >
            <Undo className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRedo}
            disabled={!canRedo}
            className="h-8 w-8 p-0"
          >
            <Redo className="w-4 h-4" />
          </Button>

          {/* Panel toggles (visual mode) */}
          {mode === 'visual' && (
            <>
              <div className="w-px h-6 bg-border mx-2" />

              {/* Auto Layout Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoLayout}
                className="h-8 text-xs gap-1.5"
                title="Automatically arrange nodes"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Auto Layout
              </Button>

              {/* Search Button */}
              <Button
                variant={showSearch ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowSearch(!showSearch)}
                className="h-8 text-xs gap-1.5"
                title="Search nodes (Cmd/Ctrl+F)"
              >
                <Search className="w-3.5 h-3.5" />
                Search
              </Button>

              <div className="w-px h-6 bg-border mx-2" />

              <Button
                variant={showPalette ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowPalette(!showPalette)}
                className="h-8 text-xs"
              >
                <ChevronLeft className={cn('w-4 h-4 mr-1 transition-transform', !showPalette && 'rotate-180')} />
                Actions
              </Button>
              <Button
                variant={showProperties ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowProperties(!showProperties)}
                className="h-8 text-xs"
              >
                Properties
                <ChevronRight className={cn('w-4 h-4 ml-1 transition-transform', !showProperties && 'rotate-180')} />
              </Button>

              <Button
                variant={showValidation ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowValidation(!showValidation)}
                className={cn(
                  'h-8 text-xs gap-1.5',
                  validationResult && !validationResult.valid && 'text-red-500 hover:text-red-600'
                )}
                title={
                  validationResult
                    ? `${validationResult.errorCount} errors, ${validationResult.warningCount} warnings`
                    : 'Show validation'
                }
              >
                {validationResult && !validationResult.valid ? (
                  <AlertCircle className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Validation
                {validationResult && (validationResult.errorCount > 0 || validationResult.warningCount > 0) && (
                  <Badge
                    variant={validationResult.errorCount > 0 ? 'destructive' : 'secondary'}
                    className="h-4 text-[10px] px-1 ml-0.5"
                  >
                    {validationResult.errorCount + validationResult.warningCount}
                  </Badge>
                )}
              </Button>
            </>
          )}

          {/* Validate button (yaml mode) */}
          {mode === 'yaml' && (
            <>
              <div className="w-px h-6 bg-border mx-2" />
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidate}
                className="h-8 text-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Validate
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}

          {/* Export Dialog */}
          <ExportDialog definition={mode === 'visual' ? definition : parseYaml(yaml) || definition} />

          {/* Help Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowShortcuts(true)}
            className="h-8 w-8 p-0"
            title="Keyboard shortcuts (?)"
          >
            <HelpCircle className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border" />

          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="h-8"
          >
            <Save className="w-4 h-4 mr-1.5" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>

          {onRun && (
            <Button
              size="sm"
              onClick={handleRun}
              disabled={isRunning}
              className="h-8"
            >
              <Play className="w-4 h-4 mr-1.5" />
              {isRunning ? 'Running...' : 'Run'}
            </Button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {yamlError && (
        <Alert variant="destructive" className="mx-4 mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="whitespace-pre-wrap">{yamlError}</AlertDescription>
        </Alert>
      )}

      {/* Success Alert */}
      {validationSuccess && !yamlError && (
        <Alert className="mx-4 mt-2 border-green-500/50 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>{validationSuccess}</AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {mode === 'visual' ? (
          <>
            {/* Node Palette */}
            {showPalette && <NodePalette />}

            {/* Search Panel */}
            {showSearch && (
              <div className="w-80 border-r">
                <SearchPanel
                  nodes={(() => {
                    const { nodes } = flowDefinitionToNodesAndEdges(definition);
                    return nodes;
                  })()}
                  onNodeSelect={(nodeId) => {
                    const { nodes } = flowDefinitionToNodesAndEdges(definition);
                    const node = nodes.find((n) => n.id === nodeId);
                    if (node) {
                      handleNodeSelect(node);
                      // Optionally focus the canvas on the selected node
                    }
                  }}
                  onClose={() => setShowSearch(false)}
                />
              </div>
            )}

            {/* Canvas */}
            <div className="flex-1 relative">
              <FlowCanvas
                definition={definition}
                onDefinitionChange={handleDefinitionChange}
                onNodeSelect={handleNodeSelect}
                selectedNodeId={selectedNode?.id}
              />
            </div>

            {/* Properties Panel */}
            {showProperties && (
              <PropertiesPanel
                node={selectedNode}
                onNodeUpdate={handleNodeUpdate}
                onClose={() => setShowProperties(false)}
                stepOutputs={(() => {
                  if (!selectedNode || !definition?.steps) return {};
                  const outputs: Record<string, Record<string, unknown>> = {};
                  for (const step of definition.steps) {
                    if (step.id === selectedNode.id) break;
                    if (step.output) {
                      outputs[step.id ?? step.name ?? ''] = Object.fromEntries(
                        Object.keys(step.output).map((k) => [k, `\${${step.id}.${k}}`])
                      );
                    }
                  }
                  return outputs;
                })()}
              />
            )}

            {/* Validation Panel */}
            {showValidation && validationResult && (
              <ValidationPanel
                result={validationResult}
                onNodeSelect={(nodeId) => {
                  const { nodes } = flowDefinitionToNodesAndEdges(definition);
                  const node = nodes.find((n) => n.id === nodeId);
                  if (node) {
                    handleNodeSelect(node);
                  }
                }}
                onClose={() => setShowValidation(false)}
                className="w-80"
              />
            )}
          </>
        ) : (
          /* YAML Editor */
          <div className="flex-1 p-4">
            <Textarea
              value={yaml}
              onChange={(e) => handleYamlChange(e.target.value)}
              placeholder="Enter your flow definition in YAML format..."
              className="w-full h-full font-mono text-sm resize-none"
            />
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
      />
    </div>
  );
}
