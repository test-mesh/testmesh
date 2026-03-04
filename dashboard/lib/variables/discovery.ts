// Variable discovery service - finds all available variables in a given context

import {
  Variable,
  VariableContext,
  VariableSource,
  BUILTIN_VARIABLES,
  extractVariableNames,
} from './types';

// Get the type of a value
function getValueType(value: any): Variable['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

// Flatten an object into dot-notation paths
function flattenObject(
  obj: Record<string, any>,
  prefix: string = '',
  source: VariableSource
): Variable[] {
  const variables: Variable[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested objects
      variables.push(...flattenObject(value, fullPath, source));
    } else {
      variables.push({
        name: fullPath,
        value,
        source,
        type: getValueType(value),
      });
    }
  }

  return variables;
}

// Discover all available variables from context
export function discoverVariables(context: VariableContext): Variable[] {
  const variables: Variable[] = [];

  // Add built-in variables
  variables.push(...BUILTIN_VARIABLES);

  // Add environment variables
  if (context.environment) {
    for (const [key, value] of Object.entries(context.environment)) {
      variables.push({
        name: `env.${key}`,
        value,
        source: 'environment',
        type: 'string',
      });
    }
  }

  // Add global variables
  if (context.global) {
    variables.push(...flattenObject(context.global, 'global', 'global'));
  }

  // Add collection variables
  if (context.collection) {
    variables.push(...flattenObject(context.collection, 'collection', 'collection'));
  }

  // Add flow variables
  if (context.flow) {
    variables.push(...flattenObject(context.flow, 'flow', 'flow'));
  }

  // Add step outputs (only from steps before current)
  if (context.stepOutputs && context.stepIds) {
    const currentIndex = context.currentStepIndex ?? context.stepIds.length;

    for (let i = 0; i < currentIndex && i < context.stepIds.length; i++) {
      const stepId = context.stepIds[i];
      const outputs = context.stepOutputs[stepId];

      if (outputs) {
        for (const [key, value] of Object.entries(outputs)) {
          const path = `steps.${stepId}.${key}`;

          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            variables.push(...flattenObject(value, path, 'step_output'));
          } else {
            variables.push({
              name: path,
              value,
              source: 'step_output',
              description: `Output from step "${stepId}"`,
              type: getValueType(value),
            });
          }
        }
      }
    }
  }

  return variables;
}

// Filter variables by fuzzy search
export function filterVariables(variables: Variable[], query: string): Variable[] {
  if (!query) return variables;

  const lowerQuery = query.toLowerCase();

  return variables.filter((v) => {
    const name = v.name.toLowerCase();
    const description = (v.description || '').toLowerCase();

    // Exact prefix match gets highest priority
    if (name.startsWith(lowerQuery)) return true;

    // Fuzzy match - all characters in order
    let queryIndex = 0;
    for (const char of name) {
      if (char === lowerQuery[queryIndex]) {
        queryIndex++;
        if (queryIndex === lowerQuery.length) return true;
      }
    }

    // Match in description
    if (description.includes(lowerQuery)) return true;

    return false;
  }).sort((a, b) => {
    // Sort by relevance
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();

    // Exact prefix matches first
    const aPrefix = aName.startsWith(lowerQuery);
    const bPrefix = bName.startsWith(lowerQuery);
    if (aPrefix && !bPrefix) return -1;
    if (!aPrefix && bPrefix) return 1;

    // Then by name length (shorter = more specific)
    return aName.length - bName.length;
  });
}

// Check which variables in a text are undefined
export function findUndefinedVariables(
  text: string,
  context: VariableContext
): string[] {
  const usedVariables = extractVariableNames(text);
  const availableVariables = discoverVariables(context);
  const availableNames = new Set(availableVariables.map((v) => v.name));

  return usedVariables.filter((name) => !availableNames.has(name));
}

// Resolve a variable value from context
export function resolveVariable(
  name: string,
  context: VariableContext
): any | undefined {
  const variables = discoverVariables(context);
  const variable = variables.find((v) => v.name === name);
  return variable?.value;
}

// Get variable info by name
export function getVariableInfo(
  name: string,
  context: VariableContext
): Variable | undefined {
  const variables = discoverVariables(context);
  return variables.find((v) => v.name === name);
}

// Group variables by source
export function groupVariablesBySource(
  variables: Variable[]
): Record<VariableSource, Variable[]> {
  const groups: Record<VariableSource, Variable[]> = {
    builtin: [],
    environment: [],
    global: [],
    collection: [],
    flow: [],
    step_output: [],
    request: [],
    response: [],
  };

  for (const variable of variables) {
    groups[variable.source].push(variable);
  }

  return groups;
}

// Format a variable value for display
export function formatVariableValue(value: any, maxLength: number = 50): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    if (json.length > maxLength) {
      return json.substring(0, maxLength - 3) + '...';
    }
    return json;
  }

  const str = String(value);
  if (str.length > maxLength) {
    return str.substring(0, maxLength - 3) + '...';
  }
  return str;
}
