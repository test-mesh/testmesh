'use client';

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import KeyValueEditor from './KeyValueEditor';
import { VariableEditor } from '@/components/editor';
import type { BodyConfig, BodyType, KeyValuePair } from '../types';
import { createEmptyPair } from '../types';
import type { VariableContext } from '@/lib/variables';

interface BodyTabProps {
  body: BodyConfig;
  onChange: (body: BodyConfig) => void;
  method: string;
  variableContext?: VariableContext;
}

const BODY_TYPES: { value: BodyType; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'No request body' },
  { value: 'json', label: 'JSON', description: 'application/json' },
  { value: 'form_data', label: 'Form Data', description: 'multipart/form-data' },
  { value: 'form_urlencoded', label: 'URL Encoded', description: 'application/x-www-form-urlencoded' },
  { value: 'raw', label: 'Raw', description: 'Custom content type' },
];

const CONTENT_TYPES = [
  'text/plain',
  'text/html',
  'text/xml',
  'application/xml',
  'application/javascript',
];

export default function BodyTab({ body, onChange, method, variableContext }: BodyTabProps) {
  // Show warning for methods that typically don't have a body
  const noBodyMethods = ['GET', 'HEAD', 'OPTIONS'];
  const showWarning = noBodyMethods.includes(method) && body.type !== 'none';

  const updateBody = (updates: Partial<BodyConfig>) => {
    onChange({ ...body, ...updates });
  };

  const handleTypeChange = (type: BodyType) => {
    const newBody: BodyConfig = { type };

    switch (type) {
      case 'json':
        newBody.json = body.json || '{\n  \n}';
        break;
      case 'raw':
        newBody.raw = body.raw || '';
        newBody.content_type = body.content_type || 'text/plain';
        break;
      case 'form_data':
        newBody.form_data = body.form_data || [createEmptyPair()];
        break;
      case 'form_urlencoded':
        newBody.form_urlencoded = body.form_urlencoded || [createEmptyPair()];
        break;
    }

    onChange(newBody);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Body type selector */}
      <div className="flex items-center gap-4">
        <Label className="text-sm">Type:</Label>
        <div className="flex gap-2">
          {BODY_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => handleTypeChange(type.value)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md border transition-colors',
                body.type === type.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 border-border hover:bg-muted'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Warning for GET/HEAD/OPTIONS */}
      {showWarning && (
        <div className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded">
          Warning: {method} requests typically do not include a body
        </div>
      )}

      {/* Body content based on type */}
      {body.type === 'none' && (
        <div className="text-sm text-muted-foreground p-8 text-center border border-dashed rounded-lg">
          No request body
        </div>
      )}

      {body.type === 'json' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">JSON Body</Label>
            <button
              onClick={() => {
                try {
                  const formatted = JSON.stringify(JSON.parse(body.json || '{}'), null, 2);
                  updateBody({ json: formatted });
                } catch {
                  // Invalid JSON, can't format
                }
              }}
              className="text-xs text-primary hover:underline"
            >
              Format JSON
            </button>
          </div>
          <VariableEditor
            value={body.json || ''}
            onChange={(value) => updateBody({ json: value })}
            language="json"
            variableContext={variableContext}
            height="200px"
            placeholder="Enter JSON body..."
          />
        </div>
      )}

      {body.type === 'raw' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Label className="text-xs text-muted-foreground">Content-Type:</Label>
            <Select
              value={body.content_type || 'text/plain'}
              onValueChange={(value) => updateBody({ content_type: value })}
            >
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="text-sm">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">or</span>
            <Input
              value={body.content_type || ''}
              onChange={(e) => updateBody({ content_type: e.target.value })}
              placeholder="Custom content type"
              className="w-48 h-8 text-sm"
            />
          </div>
          <VariableEditor
            value={body.raw || ''}
            onChange={(value) => updateBody({ raw: value })}
            language="plaintext"
            variableContext={variableContext}
            height="200px"
            placeholder="Enter raw body content..."
          />
        </div>
      )}

      {body.type === 'form_data' && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Form Data (multipart/form-data)</Label>
          <KeyValueEditor
            pairs={body.form_data || []}
            onChange={(pairs: KeyValuePair[]) => updateBody({ form_data: pairs })}
            keyPlaceholder="Field Name"
            valuePlaceholder="Value"
          />
        </div>
      )}

      {body.type === 'form_urlencoded' && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            URL Encoded Form (application/x-www-form-urlencoded)
          </Label>
          <KeyValueEditor
            pairs={body.form_urlencoded || []}
            onChange={(pairs: KeyValuePair[]) => updateBody({ form_urlencoded: pairs })}
            keyPlaceholder="Field Name"
            valuePlaceholder="Value"
          />
        </div>
      )}
    </div>
  );
}
