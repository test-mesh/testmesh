'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import Editor, { OnMount, Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { cn } from '@/lib/utils';
import {
  Variable,
  VariableContext,
  discoverVariables,
  filterVariables,
  findUndefinedVariables,
  formatVariableValue,
  groupVariablesBySource,
} from '@/lib/variables';

interface VariableEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: 'yaml' | 'json' | 'javascript' | 'plaintext';
  variableContext?: VariableContext;
  height?: string | number;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
}

// Source icons for autocomplete
const SOURCE_ICONS: Record<string, string> = {
  builtin: '⚡',
  environment: '🌍',
  global: '🌐',
  collection: '📁',
  flow: '🔄',
  step_output: '📤',
  request: '📥',
  response: '📨',
};

export default function VariableEditor({
  value,
  onChange,
  language = 'yaml',
  variableContext = {},
  height = '300px',
  className,
  placeholder,
  readOnly = false,
}: VariableEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [undefinedVars, setUndefinedVars] = useState<string[]>([]);

  // Update undefined variables markers
  const updateMarkers = useCallback(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const text = model.getValue();
    const undefined_vars = findUndefinedVariables(text, variableContext);
    setUndefinedVars(undefined_vars);

    // Create markers for undefined variables
    const markers: editor.IMarkerData[] = [];

    for (const varName of undefined_vars) {
      // Find all occurrences of this variable
      const patterns = [
        new RegExp(`\\$\\{${escapeRegex(varName)}\\}`, 'g'),
        new RegExp(`\\{\\{${escapeRegex(varName)}\\}\\}`, 'g'),
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const startPos = model.getPositionAt(match.index);
          const endPos = model.getPositionAt(match.index + match[0].length);

          markers.push({
            severity: monacoRef.current!.MarkerSeverity.Warning,
            message: `Variable "${varName}" is not defined`,
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
          });
        }
      }
    }

    monacoRef.current.editor.setModelMarkers(model, 'variables', markers);
  }, [variableContext]);

  // Handle editor mount
  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Register completion provider for variables
      const disposable = monaco.languages.registerCompletionItemProvider(language, {
        triggerCharacters: ['$', '{'],

        provideCompletionItems: (model: any, position: any) => {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          // Check if we're inside a variable expression
          const dollarBraceMatch = textUntilPosition.match(/\$\{([^}]*)$/);
          const doubleBraceMatch = textUntilPosition.match(/\{\{([^}]*)$/);

          if (!dollarBraceMatch && !doubleBraceMatch) {
            // Check if cursor is right after $ or {{
            if (textUntilPosition.endsWith('$')) {
              // Suggest starting ${
              return {
                suggestions: [
                  {
                    label: '${...}',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: '{${1:variable}}',
                    insertTextRules:
                      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'Insert variable reference',
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: position.column,
                      endLineNumber: position.lineNumber,
                      endColumn: position.column,
                    },
                  },
                ],
              };
            }

            if (textUntilPosition.endsWith('{')) {
              // Suggest starting {{
              return {
                suggestions: [
                  {
                    label: '{{...}}',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: '{${1:variable}}}',
                    insertTextRules:
                      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'Insert variable reference (Postman style)',
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: position.column,
                      endLineNumber: position.lineNumber,
                      endColumn: position.column,
                    },
                  },
                ],
              };
            }

            return { suggestions: [] };
          }

          // Extract the partial variable name being typed
          const partialName = dollarBraceMatch?.[1] || doubleBraceMatch?.[1] || '';

          // Get available variables
          const allVariables = discoverVariables(variableContext);
          const filteredVariables = filterVariables(allVariables, partialName);
          const groupedVariables = groupVariablesBySource(filteredVariables);

          // Calculate range to replace
          const startColumn = dollarBraceMatch
            ? position.column - partialName.length
            : position.column - partialName.length;

          // Build suggestions
          const suggestions: any[] = [];

          // Add variables grouped by source
          const sourceOrder: Array<keyof typeof groupedVariables> = [
            'step_output',
            'flow',
            'collection',
            'global',
            'environment',
            'builtin',
          ];

          for (const source of sourceOrder) {
            const vars = groupedVariables[source];
            if (vars.length === 0) continue;

            for (const variable of vars) {
              const icon = SOURCE_ICONS[variable.source] || '📌';
              const valuePreview = formatVariableValue(variable.value, 40);

              suggestions.push({
                label: {
                  label: variable.name,
                  description: valuePreview,
                },
                kind: monaco.languages.CompletionItemKind.Variable,
                detail: `${icon} ${variable.source}`,
                documentation: {
                  value: [
                    `**${variable.name}**`,
                    '',
                    `Source: ${variable.source}`,
                    `Type: ${variable.type}`,
                    variable.description ? `\n${variable.description}` : '',
                    '',
                    '```',
                    formatVariableValue(variable.value, 200),
                    '```',
                  ].join('\n'),
                },
                insertText: variable.name,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: startColumn,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
                sortText: `${sourceOrder.indexOf(source)}_${variable.name}`,
              });
            }
          }

          return { suggestions };
        },
      });

      // Add hover provider for variable values
      const hoverDisposable = monaco.languages.registerHoverProvider(language, {
        provideHover: (model: any, position: any) => {
          const line = model.getLineContent(position.lineNumber);

          // Find variable at cursor position
          const patterns = [
            /\$\{([^}]+)\}/g,
            /\{\{([^}]+)\}\}/g,
          ];

          for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(line)) !== null) {
              const startCol = match.index + 1;
              const endCol = match.index + match[0].length + 1;

              if (position.column >= startCol && position.column <= endCol) {
                const varName = match[1];
                const allVariables = discoverVariables(variableContext);
                const variable = allVariables.find((v) => v.name === varName);

                if (variable) {
                  const icon = SOURCE_ICONS[variable.source] || '📌';

                  return {
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: startCol,
                      endLineNumber: position.lineNumber,
                      endColumn: endCol,
                    },
                    contents: [
                      {
                        value: [
                          `**${icon} ${varName}**`,
                          '',
                          `Source: \`${variable.source}\``,
                          `Type: \`${variable.type}\``,
                          '',
                          '```json',
                          formatVariableValue(variable.value, 500),
                          '```',
                        ].join('\n'),
                      },
                    ],
                  };
                } else {
                  return {
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: startCol,
                      endLineNumber: position.lineNumber,
                      endColumn: endCol,
                    },
                    contents: [
                      {
                        value: `⚠️ **Variable not defined**: \`${varName}\``,
                      },
                    ],
                  };
                }
              }
            }
          }

          return null;
        },
      });

      // Clean up on unmount
      editor.onDidDispose(() => {
        disposable.dispose();
        hoverDisposable.dispose();
      });

      // Initial marker update
      updateMarkers();
    },
    [language, variableContext, updateMarkers]
  );

  // Update markers when value or context changes
  useEffect(() => {
    updateMarkers();
  }, [value, variableContext, updateMarkers]);

  return (
    <div className={cn('border rounded-md overflow-hidden', className)}>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(v) => onChange(v || '')}
        onMount={handleEditorMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          automaticLayout: true,
          readOnly,
          placeholder,
          quickSuggestions: {
            other: true,
            comments: false,
            strings: true,
          },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          tabCompletion: 'on',
        }}
      />

      {/* Undefined variables warning */}
      {undefinedVars.length > 0 && (
        <div className="px-3 py-1.5 bg-yellow-50 dark:bg-yellow-950/30 border-t text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
          <span>⚠️</span>
          <span>
            Undefined variables: {undefinedVars.slice(0, 3).join(', ')}
            {undefinedVars.length > 3 && ` (+${undefinedVars.length - 3} more)`}
          </span>
        </div>
      )}
    </div>
  );
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
