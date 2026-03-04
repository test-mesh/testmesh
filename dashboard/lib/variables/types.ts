// Variable system types

export interface Variable {
  name: string;
  value: string | number | boolean | null;
  source: VariableSource;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
}

export type VariableSource =
  | 'environment'    // From environment variables
  | 'global'         // Global variables (project-wide)
  | 'collection'     // Collection-level variables
  | 'flow'           // Flow-level variables
  | 'step_output'    // Output from a previous step
  | 'request'        // From the current request
  | 'response'       // From response data
  | 'builtin';       // Built-in variables (timestamps, etc.)

export interface VariableContext {
  // Environment variables
  environment?: Record<string, string>;

  // Global/collection variables
  global?: Record<string, any>;
  collection?: Record<string, any>;

  // Flow-level variables
  flow?: Record<string, any>;

  // Step outputs from previous steps (stepId -> output)
  stepOutputs?: Record<string, Record<string, any>>;

  // Current step index (for knowing which step outputs are available)
  currentStepIndex?: number;

  // Step IDs in order
  stepIds?: string[];
}

// Built-in variables that are always available
export const BUILTIN_VARIABLES: Variable[] = [
  {
    name: '$timestamp',
    value: Date.now(),
    source: 'builtin',
    description: 'Current Unix timestamp in milliseconds',
    type: 'number',
  },
  {
    name: '$isoTimestamp',
    value: new Date().toISOString(),
    source: 'builtin',
    description: 'Current timestamp in ISO 8601 format',
    type: 'string',
  },
  {
    name: '$randomInt',
    value: Math.floor(Math.random() * 1000000),
    source: 'builtin',
    description: 'Random integer between 0 and 999999',
    type: 'number',
  },
  {
    name: '$randomUUID',
    value: crypto.randomUUID?.() || 'uuid-not-available',
    source: 'builtin',
    description: 'Random UUID v4',
    type: 'string',
  },
  {
    name: '$guid',
    value: crypto.randomUUID?.() || 'guid-not-available',
    source: 'builtin',
    description: 'Alias for $randomUUID',
    type: 'string',
  },
];

// Variable syntax patterns
export const VARIABLE_PATTERNS = {
  // ${variable} syntax
  dollarBrace: /\$\{([^}]+)\}/g,
  // {{variable}} syntax (Postman-style)
  doubleBrace: /\{\{([^}]+)\}\}/g,
  // Combined pattern for both
  combined: /(?:\$\{([^}]+)\}|\{\{([^}]+)\}\})/g,
};

// Extract variable names from a string
export function extractVariableNames(text: string): string[] {
  const variables: string[] = [];

  // Reset regex lastIndex
  VARIABLE_PATTERNS.dollarBrace.lastIndex = 0;
  VARIABLE_PATTERNS.doubleBrace.lastIndex = 0;

  let match;

  // Match ${var} syntax
  while ((match = VARIABLE_PATTERNS.dollarBrace.exec(text)) !== null) {
    variables.push(match[1]);
  }

  // Match {{var}} syntax
  while ((match = VARIABLE_PATTERNS.doubleBrace.exec(text)) !== null) {
    variables.push(match[1]);
  }

  return [...new Set(variables)]; // Remove duplicates
}

// Check if a variable name references a step output (e.g., "steps.stepId.fieldName")
export function isStepOutputVariable(varName: string): boolean {
  return varName.startsWith('steps.') || varName.includes('.output.');
}

// Parse step output variable path
export function parseStepOutputPath(varName: string): { stepId: string; path: string } | null {
  // Format: steps.stepId.path.to.value or stepId.output.path
  if (varName.startsWith('steps.')) {
    const parts = varName.slice(6).split('.');
    if (parts.length >= 2) {
      return {
        stepId: parts[0],
        path: parts.slice(1).join('.'),
      };
    }
  }

  const outputMatch = varName.match(/^(\w+)\.output\.(.+)$/);
  if (outputMatch) {
    return {
      stepId: outputMatch[1],
      path: outputMatch[2],
    };
  }

  return null;
}
