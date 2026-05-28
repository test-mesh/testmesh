'use client';

import { useState } from 'react';
import {
  Database,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  FileCode,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import VariablePicker from './VariablePicker';

interface DatabaseStepFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  variables?: Record<string, string>;
  stepOutputs?: Record<string, Record<string, unknown>>;
  className?: string;
}

const DB_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL', placeholder: 'postgresql://user:pass@localhost:5432/db' },
  { value: 'mysql', label: 'MySQL', placeholder: 'mysql://user:pass@localhost:3306/db' },
  { value: 'sqlite', label: 'SQLite', placeholder: '/path/to/database.db' },
  { value: 'mongodb', label: 'MongoDB', placeholder: 'mongodb://localhost:27017/db' },
  { value: 'redis', label: 'Redis', placeholder: 'redis://localhost:6379' },
];

const QUERY_TEMPLATES = [
  { label: 'SELECT', query: 'SELECT * FROM table_name WHERE condition;' },
  { label: 'INSERT', query: 'INSERT INTO table_name (column1, column2) VALUES ($1, $2);' },
  { label: 'UPDATE', query: 'UPDATE table_name SET column1 = $1 WHERE id = $2;' },
  { label: 'DELETE', query: 'DELETE FROM table_name WHERE id = $1;' },
  { label: 'COUNT', query: 'SELECT COUNT(*) FROM table_name;' },
];

export default function DatabaseStepForm({
  config,
  onChange,
  variables = {},
  stepOutputs = {},
  className,
}: DatabaseStepFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const dbType = (config.type as string) || 'postgresql';
  const dbConfig = DB_TYPES.find((d) => d.value === dbType) || DB_TYPES[0];

  const params: string[] = (() => {
    const p = config.params;
    if (Array.isArray(p)) return p.map(String);
    return [];
  })();

  const updateParams = (newParams: string[]) => {
    onChange('params', newParams);
  };

  const detectParams = (query: string): number => {
    const matches = query.match(/\$\d+/g);
    return matches ? Math.max(...matches.map((m) => parseInt(m.slice(1)))) : 0;
  };

  const queryParamCount = detectParams((config.query as string) || '');

  const ensureParamsLength = () => {
    if (params.length < queryParamCount) {
      const newParams = [...params];
      while (newParams.length < queryParamCount) {
        newParams.push('');
      }
      updateParams(newParams);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <Label className="text-xs font-medium">Database Type</Label>
        <Select value={dbType} onValueChange={(v) => onChange('type', v)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DB_TYPES.map((db) => (
              <SelectItem key={db.value} value={db.value} className="text-sm">
                {db.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium flex items-center gap-1">
          <Lock className="w-3 h-3" />
          Connection String
        </Label>
        <VariablePicker
          value={(config.connection as string) || ''}
          onChange={(v) => onChange('connection', v)}
          placeholder={dbConfig.placeholder}
          variables={variables}
          stepOutputs={stepOutputs}
        />
        <p className="text-[10px] text-[#4a6480]">
          Use environment variables for sensitive data: {'${DB_CONNECTION}'}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium flex items-center gap-1">
            <FileCode className="w-3 h-3" />
            SQL Query
          </Label>
          <Collapsible open={showTemplates} onOpenChange={setShowTemplates}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 h-5 px-2 rounded text-[10px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
              >
                Templates
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="absolute right-0 mt-1 z-10 bg-[#0f1923] border border-[#1e2d3d] rounded-md shadow-lg p-1 min-w-[150px]">
              {QUERY_TEMPLATES.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => {
                    onChange('query', template.query);
                    setShowTemplates(false);
                  }}
                  className="block w-full text-left px-2 py-1 text-xs rounded text-[#7fa8c8] hover:bg-[#1a2d3d] hover:text-[#c8dce8] transition-colors"
                >
                  {template.label}
                </button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
        <Textarea
          value={(config.query as string) || ''}
          onChange={(e) => {
            onChange('query', e.target.value);
            setTimeout(ensureParamsLength, 0);
          }}
          placeholder="SELECT * FROM users WHERE id = $1;"
          className="text-xs font-mono resize-none min-h-[100px]"
        />
        <p className="text-[10px] text-[#4a6480]">
          Use $1, $2, etc. for parameterized queries
        </p>
      </div>

      {(queryParamCount > 0 || params.length > 0) && (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Parameters</Label>
          <div className="space-y-2">
            {params.map((param, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs text-[#4a6480] w-6">${index + 1}</span>
                <VariablePicker
                  value={param}
                  onChange={(v) => {
                    const newParams = [...params];
                    newParams[index] = v;
                    updateParams(newParams);
                  }}
                  placeholder={`Parameter ${index + 1}`}
                  variables={variables}
                  stepOutputs={stepOutputs}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => updateParams(params.filter((_, i) => i !== index))}
                  className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => updateParams([...params, ''])}
            className="flex items-center gap-1 h-7 px-3 rounded border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Parameter
          </button>
        </div>
      )}

      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-[#4a6480] hover:text-[#7fa8c8] transition-colors">
          {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Advanced Options
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3 pt-3 border-t border-[#1e2d3d]">
          <div className="flex items-center gap-2">
            <Switch
              checked={(config.transaction as boolean) || false}
              onCheckedChange={(checked) => onChange('transaction', checked)}
            />
            <Label className="text-xs">Wrap in transaction</Label>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Query Timeout</Label>
            <Input
              value={(config.timeout as string) || ''}
              onChange={(e) => onChange('timeout', e.target.value)}
              placeholder="30s"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Max Rows</Label>
            <Input
              type="number"
              value={(config.max_rows as number) ?? ''}
              onChange={(e) => onChange('max_rows', e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="1000"
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-[#4a6480]">
              Limit returned rows to prevent memory issues
            </p>
          </div>

          {dbType === 'postgresql' && (
            <div className="space-y-2">
              <Label className="text-xs">SSL Mode</Label>
              <Select
                value={(config.ssl_mode as string) || 'prefer'}
                onValueChange={(v) => onChange('ssl_mode', v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disable" className="text-xs">Disable</SelectItem>
                  <SelectItem value="require" className="text-xs">Require</SelectItem>
                  <SelectItem value="verify-ca" className="text-xs">Verify CA</SelectItem>
                  <SelectItem value="verify-full" className="text-xs">Verify Full</SelectItem>
                  <SelectItem value="prefer" className="text-xs">Prefer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Pool Min</Label>
              <Input
                type="number"
                value={(config.pool_min as number) ?? ''}
                onChange={(e) => onChange('pool_min', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="1"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Pool Max</Label>
              <Input
                type="number"
                value={(config.pool_max as number) ?? ''}
                onChange={(e) => onChange('pool_max', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="10"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
