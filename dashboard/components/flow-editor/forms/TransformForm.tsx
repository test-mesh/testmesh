'use client';

import { Wand2, Code, List, Filter, Calculator } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface TransformFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

const TRANSFORM_OPERATIONS = [
  { value: 'jsonpath', label: 'JSONPath Extract', icon: Filter },
  { value: 'jq', label: 'JQ Transform', icon: Code },
  { value: 'template', label: 'Template String', icon: Code },
  { value: 'javascript', label: 'JavaScript', icon: Code },
  { value: 'base64_encode', label: 'Base64 Encode', icon: Calculator },
  { value: 'base64_decode', label: 'Base64 Decode', icon: Calculator },
  { value: 'json_parse', label: 'JSON Parse', icon: Wand2 },
  { value: 'json_stringify', label: 'JSON Stringify', icon: Wand2 },
  { value: 'split', label: 'String Split', icon: List },
  { value: 'join', label: 'Array Join', icon: List },
  { value: 'map', label: 'Array Map', icon: List },
  { value: 'filter', label: 'Array Filter', icon: Filter },
  { value: 'sort', label: 'Array Sort', icon: List },
  { value: 'unique', label: 'Array Unique', icon: List },
];

const TEMPLATES = {
  jsonpath: {
    input: '${previous_step.body}',
    expression: '$.data.items[*].name',
    description: 'Extract array of names using JSONPath',
  },
  jq: {
    input: '${api_response.body}',
    expression: '.data | map({id, name})',
    description: 'Transform JSON using jq syntax',
  },
  template: {
    input: '${user_data}',
    expression: 'Hello ${input.name}, your ID is ${input.id}',
    description: 'Create formatted string from variables',
  },
  javascript: {
    input: '${response.body}',
    expression: 'return input.items.filter(item => item.active).length',
    description: 'Custom JavaScript transformation',
  },
  base64_encode: {
    input: '${credentials}',
    expression: '',
    description: 'Encode string to Base64',
  },
  base64_decode: {
    input: '${encoded_data}',
    expression: '',
    description: 'Decode Base64 string',
  },
  json_parse: {
    input: '${json_string}',
    expression: '',
    description: 'Parse JSON string to object',
  },
  json_stringify: {
    input: '${data_object}',
    expression: '',
    description: 'Convert object to JSON string',
  },
  split: {
    input: '${csv_string}',
    expression: ',',
    description: 'Split string by delimiter',
  },
  join: {
    input: '${string_array}',
    expression: ', ',
    description: 'Join array elements with separator',
  },
  map: {
    input: '${items}',
    expression: 'item => item.toUpperCase()',
    description: 'Transform each array element',
  },
  filter: {
    input: '${items}',
    expression: 'item => item.active === true',
    description: 'Filter array by condition',
  },
  sort: {
    input: '${items}',
    expression: '(a, b) => a.price - b.price',
    description: 'Sort array by comparator',
  },
  unique: {
    input: '${items}',
    expression: '',
    description: 'Remove duplicate values from array',
  },
};

export default function TransformForm({
  config,
  onChange,
  className,
}: TransformFormProps) {
  const operation = (config.operation as string) || 'jsonpath';
  const template = TEMPLATES[operation as keyof typeof TEMPLATES];

  const loadTemplate = () => {
    if (template) {
      onChange('input', template.input);
      onChange('expression', template.expression);
    }
  };

  const needsExpression = ![
    'base64_encode',
    'base64_decode',
    'json_parse',
    'json_stringify',
    'unique',
  ].includes(operation);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Wand2 className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-medium">Transform Data</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Transform, extract, or manipulate data using various operations and expressions.
        </p>
      </div>

      {/* Operation Type */}
      <div className="space-y-2">
        <Label htmlFor="operation">Transform Operation</Label>
        <Select
          value={operation}
          onValueChange={(v) => {
            onChange('operation', v);
            // Auto-load template when operation changes
            const newTemplate = TEMPLATES[v as keyof typeof TEMPLATES];
            if (newTemplate) {
              onChange('input', newTemplate.input);
              onChange('expression', newTemplate.expression);
            }
          }}
        >
          <SelectTrigger id="operation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSFORM_OPERATIONS.map((op) => {
              const Icon = op.icon;
              return (
                <SelectItem key={op.value} value={op.value}>
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {op.label}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {template && (
          <p className="text-xs text-muted-foreground">{template.description}</p>
        )}
      </div>

      {/* Input Source */}
      <div className="space-y-2">
        <Label htmlFor="input">Input Data</Label>
        <Textarea
          id="input"
          value={(config.input as string) || ''}
          onChange={(e) => onChange('input', e.target.value)}
          placeholder="${previous_step.output}"
          rows={3}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Source data to transform. Use {'${variable}'} to reference step outputs.
        </p>
      </div>

      {/* Expression */}
      {needsExpression && (
        <div className="space-y-2">
          <Label htmlFor="expression">
            {operation === 'template' ? 'Template' : 'Expression'}
          </Label>
          <Textarea
            id="expression"
            value={(config.expression as string) || ''}
            onChange={(e) => onChange('expression', e.target.value)}
            placeholder={template?.expression || 'Enter expression...'}
            rows={operation === 'javascript' ? 6 : 4}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {operation === 'jsonpath' && 'JSONPath expression (e.g., $.data[*].name)'}
            {operation === 'jq' && 'JQ filter expression (e.g., .data | map(.id))'}
            {operation === 'template' && 'Template with ${variables} placeholders'}
            {operation === 'javascript' && 'JavaScript function body. Return the result.'}
            {operation === 'split' && 'Delimiter to split string by'}
            {operation === 'join' && 'Separator to join array elements'}
            {operation === 'map' && 'JavaScript arrow function: item => ...'}
            {operation === 'filter' && 'JavaScript arrow function: item => boolean'}
            {operation === 'sort' && 'JavaScript comparator: (a, b) => ...'}
          </p>
        </div>
      )}

      {/* Output Variable */}
      <div className="space-y-2">
        <Label htmlFor="output_var">Output Variable Name</Label>
        <Input
          id="output_var"
          value={(config.output_var as string) || ''}
          onChange={(e) => onChange('output_var', e.target.value)}
          placeholder="transformed_data"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Variable name to store the transformation result
        </p>
      </div>

      {/* Common Examples */}
      <details className="space-y-2 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Common Transform Patterns
        </summary>
        <div className="pt-2 space-y-3 text-xs">
          <div>
            <p className="font-medium mb-1 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Extract Nested Data
            </p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Operation: JSONPath</div>
              <div>Input: ${'${api_response.body}'}</div>
              <div>Expression: $.data.users[*].email</div>
              <div>Result: Array of email addresses</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1 flex items-center gap-1">
              <Code className="w-3 h-3" />
              Format String
            </p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Operation: Template</div>
              <div>Input: ${'${user}'}</div>
              <div>Expression: Hello ${'${input.name}'}, ID: ${'${input.id}'}</div>
              <div>Result: "Hello John, ID: 123"</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1 flex items-center gap-1">
              <List className="w-3 h-3" />
              Filter Array
            </p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Operation: Filter</div>
              <div>Input: ${'${items}'}</div>
              <div>Expression: item =&gt; item.price &gt; 100</div>
              <div>Result: Items with price over 100</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1 flex items-center gap-1">
              <Calculator className="w-3 h-3" />
              Encode Credentials
            </p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Operation: Base64 Encode</div>
              <div>Input: username:password</div>
              <div>Result: dXNlcm5hbWU6cGFzc3dvcmQ=</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1 flex items-center gap-1">
              <Code className="w-3 h-3" />
              Custom Logic
            </p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Operation: JavaScript</div>
              <div>Input: ${'${response.body}'}</div>
              <div className="whitespace-pre-wrap">
                {`Expression:
const total = input.items.reduce(
  (sum, item) => sum + item.price, 0
);
return { total, count: input.items.length };`}
              </div>
            </div>
          </div>
        </div>
      </details>

      {/* Quick Reference */}
      <details className="space-y-2 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Quick Reference
        </summary>
        <div className="pt-2 space-y-2 text-xs">
          <div>
            <p className="font-medium mb-1">JSONPath Syntax</p>
            <div className="space-y-0.5 text-[10px] font-mono text-muted-foreground">
              <div>$ - Root object</div>
              <div>$.field - Access property</div>
              <div>$.items[0] - Array index</div>
              <div>$.items[*] - All array elements</div>
              <div>$.items[?(@.active)] - Filter</div>
              <div>$..email - Recursive descent</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">JQ Syntax</p>
            <div className="space-y-0.5 text-[10px] font-mono text-muted-foreground">
              <div>.field - Access property</div>
              <div>.items[] - Array elements</div>
              <div>.items | map(.id) - Transform</div>
              <div>select(.active) - Filter</div>
              <div>keys - Get object keys</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">Template Variables</p>
            <div className="space-y-0.5 text-[10px] font-mono text-muted-foreground">
              <div>${'${input.field}'} - From input data</div>
              <div>${'${step_id.output}'} - From step output</div>
              <div>${'${ENV_VAR}'} - Environment variable</div>
            </div>
          </div>
        </div>
      </details>

      {/* Output Info */}
      <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wand2 className="h-4 w-4" />
          Output Access
        </div>
        <div className="text-xs text-muted-foreground">
          Access the transformed data using:{' '}
          <code className="font-mono">${'{'}
            {(config.output_var as string) || 'output_var'}
          {'}'}</code>
        </div>
      </div>
    </div>
  );
}
