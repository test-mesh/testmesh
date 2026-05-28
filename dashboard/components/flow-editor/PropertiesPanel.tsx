'use client';

import { useState, useEffect } from 'react';
import {
  Globe,
  Database,
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
  Plus,
  Trash2,
  X,
  HelpCircle,
  MessageSquare,
  GitMerge,
  AlertTriangle,
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
import type { FlowNode, FlowNodeData, ActionType, Comment } from './types';
import { isFlowNodeData } from './types';
import { useActiveEnvironment } from '@/lib/hooks/useEnvironments';
import CommentPanel from './CommentPanel';
import HTTPStepForm from './forms/HTTPStepForm';
import KeyValueEditor from './forms/KeyValueEditor';
import DatabaseQueryForm from './forms/DatabaseQueryForm';
import KafkaPublishForm from './forms/KafkaPublishForm';
import KafkaConsumeForm from './forms/KafkaConsumeForm';
import WaitUntilForm from './forms/WaitUntilForm';
import WaitForForm from './forms/WaitForForm';
import DBPollForm from './forms/DBPollForm';
import SubFlowForm from './forms/SubFlowForm';
import ParallelForm from './forms/ParallelForm';
import GrpcCallForm from './forms/GrpcCallForm';
import GrpcStreamForm from './forms/GrpcStreamForm';
import WebSocketForm from './forms/WebSocketForm';
import BrowserForm from './forms/BrowserForm';
import TransformForm from './forms/TransformForm';
import AssertionBuilder from './forms/AssertionBuilder';
import MockServerStartForm from './forms/MockServerStartForm';
import JSONPathBuilder from './forms/JSONPathBuilder';
import ErrorHandlingPanel, { type ErrorHandlingConfig } from './forms/ErrorHandlingPanel';
import RetryConfigPanel, { type RetryConfig } from './forms/RetryConfigPanel';
import ConditionForm from './forms/ConditionForm';
import ForEachForm from './forms/ForEachForm';
import RedisForm from './forms/RedisForm';
import MinioForm from './forms/MinioForm';
import Neo4jForm from './forms/Neo4jForm';
import OtelForm from './forms/OtelForm';
import PostgreSQLNativeForm from './forms/PostgreSQLNativeForm';
import MockServerConfigureForm from './forms/MockServerConfigureForm';

const actionIcons: Record<ActionType, React.ElementType> = {
  http_request: Globe, grpc_call: Globe, grpc_stream: Globe, websocket: Globe,
  database_query: Database, db_poll: Database,
  kafka_producer: MessageSquare, kafka_consumer: MessageSquare,
  browser: Globe, log: FileText, delay: Clock, assert: CheckCircle,
  transform: Wand2, condition: GitBranch, for_each: Repeat, parallel: GitMerge,
  wait_for: Clock, wait_until: Clock, run_flow: GitBranch,
  mock_server_start: Server, mock_server_stop: ServerOff,
  mock_server_verify: CheckCircle, mock_server_update: Server,
  mock_server_reset_state: Server, contract_generate: FileCode,
  contract_verify: FileCheck, docker_run: Server, docker_stop: ServerOff,
  'redis.get': Database, 'redis.set': Database, 'redis.del': Database, 'redis.exists': Database,
  'minio.put': FileText, 'minio.get': FileText, 'minio.delete': FileText, 'minio.assert': CheckCircle,
  'neo4j.query': Database, 'neo4j.assert': CheckCircle,
  'otel.inject': AlertTriangle, 'otel.assert': CheckCircle,
  'postgresql.query': Database, 'postgresql.insert': Database, 'postgresql.update': Database,
  'postgresql.delete': Database, 'postgresql.assert': CheckCircle, 'postgresql.execute': Database,
  'postgresql.transaction': Database, 'postgresql.tables': Database, 'postgresql.columns': Database,
  mock_server_configure: Server,
};

type PropertiesTab = 'general' | 'config' | 'assert' | 'output' | 'error' | 'comments';

const PROP_TABS: { value: PropertiesTab; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'config', label: 'Config' },
  { value: 'assert', label: 'Assert' },
  { value: 'output', label: 'Output' },
  { value: 'error', label: 'Error' },
  { value: 'comments', label: 'Comments' },
];

interface PropertiesPanelProps {
  node: FlowNode | null;
  onNodeUpdate: (nodeId: string, data: Partial<FlowNodeData>) => void;
  onClose?: () => void;
  className?: string;
  stepOutputs?: Record<string, Record<string, unknown>>;
}

export default function PropertiesPanel({
  node,
  onNodeUpdate,
  onClose,
  className,
  stepOutputs = {},
}: PropertiesPanelProps) {
  const [localData, setLocalData] = useState<FlowNodeData | null>(null);
  const [tab, setTab] = useState<PropertiesTab>('general');
  const { activeEnvironment } = useActiveEnvironment();

  const envVariables: Record<string, string> = {};
  if (activeEnvironment) {
    for (const v of activeEnvironment.variables) {
      if (v.enabled && !v.is_secret) envVariables[v.key] = v.value;
    }
  }

  useEffect(() => {
    if (node && isFlowNodeData(node.data)) {
      setLocalData({ ...node.data });
    } else {
      setLocalData(null);
    }
  }, [node]);

  const updateData = (updates: Partial<FlowNodeData>) => {
    if (!node || !localData) return;
    const newData = { ...localData, ...updates };
    setLocalData(newData);
    onNodeUpdate(node.id, updates);
  };

  const updateConfig = (key: string, value: any) => {
    if (!localData) return;
    updateData({ config: { ...localData.config, [key]: value } });
  };

  if (!node || !localData) {
    return (
      <div className={cn('w-80 border-l border-[#1a2332] bg-[#0b0f18] p-4', className)}>
        <div className="text-center py-12 text-[#3d5670]">
          <p className="text-sm">Select a node to edit its properties</p>
        </div>
      </div>
    );
  }

  const Icon = actionIcons[localData.action] || HelpCircle;
  const commentCount = localData.comments?.length ?? 0;

  return (
    <div className={cn('w-80 border-l border-[#1a2332] bg-[#0b0f18] flex flex-col h-full', className)}>
      {/* Header */}
      <div className="p-3 border-b border-[#1a2332] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-[#1a2332]">
            <Icon className="w-4 h-4 text-[#4a6480]" />
          </div>
          <span className="font-semibold text-sm text-[#c8dce8]">Properties</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#1a2332] overflow-x-auto">
        {PROP_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              'flex items-center gap-1 shrink-0 h-6 px-2 rounded text-[10px] font-medium transition-colors',
              tab === value ? 'bg-teal-400/15 text-teal-400' : 'text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d]'
            )}
          >
            {value === 'comments' && <MessageSquare className="w-3 h-3" />}
            {label}
            {value === 'comments' && commentCount > 0 && (
              <span className="ml-0.5 px-1 py-0.5 text-[9px] bg-teal-400/15 text-teal-400 rounded">
                {commentCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'general' && (
          <div className="p-3 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="step-id" className="text-xs">Step ID</Label>
              <Input id="step-id" value={localData.stepId} onChange={(e) => updateData({ stepId: e.target.value })} placeholder="step_id" className="h-8 text-sm font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="step-name" className="text-xs">Name</Label>
              <Input id="step-name" value={localData.name || ''} onChange={(e) => updateData({ name: e.target.value, label: e.target.value })} placeholder="Step name" className="h-8 text-sm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="step-description" className="text-xs">Description</Label>
              <Textarea id="step-description" value={localData.description || ''} onChange={(e) => updateData({ description: e.target.value })} placeholder="Optional description" className="text-sm resize-none" rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="step-timeout" className="text-xs">Timeout</Label>
              <Input id="step-timeout" value={localData.timeout || ''} onChange={(e) => updateData({ timeout: e.target.value })} placeholder="e.g., 30s" className="h-8 text-sm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="step-when" className="text-xs">Run condition</Label>
              <Input id="step-when" value={localData.when || ''} onChange={(e) => updateData({ when: e.target.value })} placeholder='${env.STAGE} == "staging"' className="h-8 text-sm font-mono" />
              <p className="text-[10px] text-[#4a6480]">Step is skipped if this expression evaluates to false</p>
            </div>
            <details className="p-3 border border-[#1e2d3d] rounded-lg bg-[#0f1923]">
              <summary className="text-xs font-medium text-[#7fa8c8] cursor-pointer">Retry Configuration</summary>
              <div className="pt-3">
                <RetryConfigPanel value={(localData.retry || {}) as RetryConfig} onChange={(retry) => updateData({ retry: retry as any })} />
              </div>
            </details>
          </div>
        )}

        {tab === 'config' && (
          <div className="p-3 space-y-4">
            <ActionConfig action={localData.action} config={localData.config} onConfigChange={updateConfig} variables={envVariables} stepOutputs={stepOutputs} />
          </div>
        )}

        {tab === 'assert' && (
          <div className="p-3 space-y-4">
            <AssertionBuilder assertions={localData.assert || []} onChange={(assertions) => updateData({ assert: assertions })} />
          </div>
        )}

        {tab === 'output' && (
          <div className="p-3 space-y-4">
            <OutputEditor output={localData.output || {}} onChange={(output) => updateData({ output })} />
          </div>
        )}

        {tab === 'error' && (
          <div className="p-3 space-y-4">
            <ErrorHandlingPanel
              value={{ on_error: (localData as any).on_error, error_steps: (localData as any).error_steps, on_timeout: (localData as any).on_timeout }}
              onChange={(errorConfig) => updateData({ on_error: errorConfig.on_error, error_steps: errorConfig.error_steps, on_timeout: errorConfig.on_timeout } as any)}
            />
          </div>
        )}

        {tab === 'comments' && (
          <CommentPanel
            nodeId={node.id}
            nodeName={localData.name || localData.label}
            comments={localData.comments || []}
            onChange={(comments: Comment[]) => updateData({ comments })}
            className="p-3"
          />
        )}
      </div>
    </div>
  );
}

function ActionConfig({
  action, config, onConfigChange, variables, stepOutputs,
}: {
  action: ActionType;
  config: Record<string, any>;
  onConfigChange: (key: string, value: any) => void;
  variables?: Record<string, string>;
  stepOutputs?: Record<string, Record<string, unknown>>;
}) {
  switch (action) {
    case 'http_request': return <HTTPStepForm config={config} onChange={onConfigChange} variables={variables} stepOutputs={stepOutputs} />;
    case 'grpc_call': return <GrpcCallForm config={config} onChange={onConfigChange} />;
    case 'grpc_stream': return <GrpcStreamForm config={config} onChange={onConfigChange} />;
    case 'websocket': return <WebSocketForm config={config} onChange={onConfigChange} />;
    case 'database_query': return <DatabaseQueryForm config={config} onChange={onConfigChange} />;
    case 'kafka_producer': return <KafkaPublishForm config={config} onChange={onConfigChange} />;
    case 'kafka_consumer': return <KafkaConsumeForm config={config} onChange={onConfigChange} />;
    case 'browser': return <BrowserForm config={config} onChange={onConfigChange} />;
    case 'parallel': return <ParallelForm config={config} onChange={onConfigChange} />;
    case 'wait_for': return <WaitForForm config={config} onChange={onConfigChange} />;
    case 'wait_until': return <WaitUntilForm config={config} onChange={onConfigChange} />;
    case 'db_poll': return <DBPollForm config={config} onChange={onConfigChange} />;
    case 'run_flow': return <SubFlowForm config={config} onChange={onConfigChange} />;
    case 'log': return <LogConfig config={config} onChange={onConfigChange} />;
    case 'delay': return <DelayConfig config={config} onChange={onConfigChange} />;
    case 'assert': return <AssertConfig config={config} onChange={onConfigChange} />;
    case 'transform': return <TransformForm config={config} onChange={onConfigChange} />;
    case 'mock_server_start': return <MockServerStartForm config={config} onChange={onConfigChange} />;
    case 'mock_server_stop': return <MockServerStopConfig config={config} onChange={onConfigChange} />;
    case 'contract_generate': return <ContractGenerateConfig config={config} onChange={onConfigChange} />;
    case 'contract_verify': return <ContractVerifyConfig config={config} onChange={onConfigChange} />;
    case 'redis.get': case 'redis.set': case 'redis.del': case 'redis.exists':
      return <RedisForm config={config} onChange={onConfigChange} action={action} />;
    case 'minio.put': case 'minio.get': case 'minio.delete': case 'minio.assert':
      return <MinioForm config={config} onChange={onConfigChange} action={action} />;
    case 'neo4j.query': case 'neo4j.assert':
      return <Neo4jForm config={config} onChange={onConfigChange} action={action} />;
    case 'otel.inject': case 'otel.assert':
      return <OtelForm config={config} onChange={onConfigChange} action={action} />;
    case 'postgresql.query': case 'postgresql.insert': case 'postgresql.update':
    case 'postgresql.delete': case 'postgresql.assert': case 'postgresql.execute':
    case 'postgresql.transaction': case 'postgresql.tables': case 'postgresql.columns':
      return <PostgreSQLNativeForm config={config} onChange={onConfigChange} action={action} />;
    case 'mock_server_configure': return <MockServerConfigureForm config={config} onChange={onConfigChange} />;
    case 'condition': return <ConditionForm config={config} onChange={onConfigChange} />;
    case 'for_each': return <ForEachForm config={config} onChange={onConfigChange} />;
    default:
      return <div className="text-xs text-[#4a6480]">No configuration options for this action</div>;
  }
}

function LogConfig({ config, onChange }: { config: Record<string, any>; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Message</Label>
        <Textarea value={config.message || ''} onChange={(e) => onChange('message', e.target.value)} placeholder="Log message with ${variables}" className="text-sm resize-none" rows={3} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Level</Label>
        <Select value={config.level || 'info'} onValueChange={(v) => onChange('level', v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="debug">Debug</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function DelayConfig({ config, onChange }: { config: Record<string, any>; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Duration</Label>
      <Input value={config.duration || ''} onChange={(e) => onChange('duration', e.target.value)} placeholder="1s, 500ms, 2m" className="h-8 text-sm" />
      <p className="text-[10px] text-[#4a6480]">Supports: ms (milliseconds), s (seconds), m (minutes)</p>
    </div>
  );
}

function AssertConfig({ config, onChange }: { config: Record<string, any>; onChange: (key: string, value: any) => void }) {
  const parseAssertions = (raw: any): string[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {} }
    return [];
  };
  const parseData = (raw: any): Record<string, any> => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (p && typeof p === 'object') return p; } catch {} }
    return {};
  };

  const assertions = parseAssertions(config.assertions);
  const dataBindings = parseData(config.data);

  const updateAssertion = (index: number, value: string) => {
    const next = [...assertions]; next[index] = value; onChange('assertions', next);
  };
  const addAssertion = () => onChange('assertions', [...assertions, '']);
  const removeAssertion = (index: number) => onChange('assertions', assertions.filter((_, i) => i !== index));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Assertions</Label>
          <button
            onClick={addAssertion}
            className="flex items-center gap-1 h-6 px-2 rounded text-[10px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {assertions.length === 0 ? (
          <p className="text-xs text-[#4a6480] italic">No assertions. Click Add to create one.</p>
        ) : (
          <div className="space-y-2">
            {assertions.map((expr, i) => (
              <div key={i} className="flex gap-1">
                <Input value={expr} onChange={(e) => updateAssertion(i, e.target.value)} placeholder={`status == '200'`} className="h-8 text-sm font-mono flex-1" />
                <button
                  onClick={() => removeAssertion(i)}
                  className="flex items-center justify-center h-8 w-8 shrink-0 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Data bindings (key: expression)</Label>
        <KeyValueEditor value={dataBindings} onChange={(val) => onChange('data', val)} keyPlaceholder="variable_name" valuePlaceholder="${step.field}" />
      </div>
    </div>
  );
}

function MockServerStopConfig({ config, onChange }: { config: Record<string, any>; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Server Name</Label>
      <Input value={config.name || ''} onChange={(e) => onChange('name', e.target.value)} placeholder="mock-api" className="h-8 text-sm" />
    </div>
  );
}

function ContractGenerateConfig({ config, onChange }: { config: Record<string, any>; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Consumer</Label>
        <Input value={config.consumer || ''} onChange={(e) => onChange('consumer', e.target.value)} placeholder="frontend-app" className="h-8 text-sm" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Provider</Label>
        <Input value={config.provider || ''} onChange={(e) => onChange('provider', e.target.value)} placeholder="user-service" className="h-8 text-sm" />
      </div>
      <div className="text-xs text-[#4a6480]">Configure interactions in the advanced settings or edit YAML directly</div>
    </div>
  );
}

function ContractVerifyConfig({ config, onChange }: { config: Record<string, any>; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Contract ID</Label>
        <Input value={config.contract_id || ''} onChange={(e) => onChange('contract_id', e.target.value)} placeholder="contract-uuid" className="h-8 text-sm font-mono" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Provider Base URL</Label>
        <Input value={config.provider_base_url || ''} onChange={(e) => onChange('provider_base_url', e.target.value)} placeholder="http://localhost:5016" className="h-8 text-sm" />
      </div>
    </div>
  );
}

function OutputEditor({ output, onChange }: { output: Record<string, string>; onChange: (output: Record<string, string>) => void }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const entries = Object.entries(output);

  const addOutput = () => onChange({ ...output, '': '' });
  const updateOutput = (oldKey: string, newKey: string, value: string) => {
    const newOutput = { ...output };
    if (oldKey !== newKey) delete newOutput[oldKey];
    newOutput[newKey] = value;
    onChange(newOutput);
  };
  const removeOutput = (key: string) => {
    const newOutput = { ...output };
    delete newOutput[key];
    onChange(newOutput);
    if (expandedKey === key) setExpandedKey(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Output Variables</Label>
        <button
          onClick={addOutput}
          className="flex items-center gap-1 h-6 px-2 rounded text-[10px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-[#4a6480]">No output variables defined</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([key, value], index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center gap-2">
                <Input value={key} onChange={(e) => updateOutput(key, e.target.value, value)} placeholder="var_name" className="h-7 text-xs font-mono w-24" />
                <span className="text-[#4a6480] text-xs">=</span>
                <Input value={value} onChange={(e) => updateOutput(key, key, e.target.value)} onFocus={() => setExpandedKey(key)} placeholder="$.path.to.value" className="h-7 text-xs font-mono flex-1" />
                <button
                  onClick={() => removeOutput(key)}
                  className="flex items-center justify-center h-7 w-7 rounded shrink-0 text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              {expandedKey === key && (
                <div className="pl-8 pr-8">
                  <JSONPathBuilder value={value} onChange={(newValue) => updateOutput(key, key, newValue)} label="" className="text-xs" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-[#4a6480]">
        Use JSONPath to extract values: $.id, $.data[0].name
        <br />
        Click on a value field to see JSONPath patterns and helpers
      </p>
    </div>
  );
}
