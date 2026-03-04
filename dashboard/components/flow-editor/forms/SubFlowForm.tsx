'use client';

import { GitBranch, ExternalLink } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import KeyValueEditor from './KeyValueEditor';

interface SubFlowFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  availableFlows?: Array<{ id: string; name: string }>;
  className?: string;
}

export default function SubFlowForm({
  config,
  onChange,
  availableFlows = [],
  className,
}: SubFlowFormProps) {
  const inputVars = (config.input as Record<string, string>) || {};

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <GitBranch className="h-4 w-4 text-teal-500" />
        <span className="text-sm font-medium">Sub-flow Execution</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Execute another flow as a step. Useful for reusable test components and modular test design.
        </p>
      </div>

      {/* Flow Selection */}
      <div className="space-y-2">
        <Label htmlFor="flow">Flow to Execute</Label>
        {availableFlows.length > 0 ? (
          <Select
            value={(config.flow as string) || ''}
            onValueChange={(v) => onChange('flow', v)}
          >
            <SelectTrigger id="flow">
              <SelectValue placeholder="Select a flow..." />
            </SelectTrigger>
            <SelectContent>
              {availableFlows.map((flow) => (
                <SelectItem key={flow.id} value={flow.id}>
                  {flow.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="flow"
            value={(config.flow as string) || ''}
            onChange={(e) => onChange('flow', e.target.value)}
            placeholder="flow-name or flow-id"
            className="font-mono"
          />
        )}
        <p className="text-xs text-muted-foreground">
          Flow name or ID to execute
        </p>
      </div>

      {/* View Flow Link */}
      {(config.flow as string) && (
        <a
          href={`/flows/${config.flow}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View flow in new tab
        </a>
      )}

      {/* Input Variables */}
      <div className="space-y-2">
        <Label>Input Variables</Label>
        <KeyValueEditor
          value={inputVars}
          onChange={(v) => onChange('input', v)}
          keyPlaceholder="variable_name"
          valuePlaceholder="${value} or literal"
        />
        <p className="text-xs text-muted-foreground">
          Variables to pass to the sub-flow. Available as env variables in the sub-flow.
        </p>
      </div>

      {/* Inherit Environment */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Inherit Environment</Label>
          <p className="text-xs text-muted-foreground">
            Pass parent flow's environment variables to sub-flow
          </p>
        </div>
        <Switch
          checked={(config.inherit_env as boolean) ?? true}
          onCheckedChange={(checked) => onChange('inherit_env', checked)}
        />
      </div>

      {/* Output Mapping */}
      <div className="space-y-2">
        <Label>Output Mapping (Optional)</Label>
        <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
          <p className="text-xs text-muted-foreground">
            Extract outputs from the sub-flow execution
          </p>
          <div className="space-y-1 text-xs font-mono">
            <div>• flow.status → success/failed</div>
            <div>• flow.output.* → sub-flow outputs</div>
            <div>• flow.duration → execution time</div>
          </div>
        </div>
      </div>

      {/* Example */}
      <details className="space-y-2 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Example Use Cases
        </summary>
        <div className="pt-2 space-y-3 text-xs">
          <div>
            <p className="font-medium mb-1">1. Reusable Login Flow</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Flow: "user-login"</div>
              <div>Input: {'{'} email, password {'}'}</div>
              <div>Output: {'{'} auth_token {'}'}</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">2. Cart Validation</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Flow: "validate-cart"</div>
              <div>Input: {'{'} cart_id {'}'}</div>
              <div>Output: {'{'} is_valid, total_amount {'}'}</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">3. Data Setup/Teardown</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Flow: "create-test-data"</div>
              <div>Input: {'{'} count, type {'}'}</div>
              <div>Output: {'{'} created_ids {'}'}</div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
