'use client';

import React, { useState, useEffect } from 'react';
import { ArrowRight, Check, X, Minus, Clock, ArrowUpDown } from 'lucide-react';

interface Execution {
  id: string;
  flowName: string;
  status: string;
  startTime: string;
  duration: number;
  steps: StepResult[];
  environment?: string;
  variables?: Record<string, any>;
}

interface StepResult {
  id: string;
  name: string;
  status: string;
  duration: number;
  error?: string;
  output?: Record<string, any>;
}

interface ExecutionComparisonProps {
  executionIds: [string, string];
  apiUrl?: string;
}

export function ExecutionComparison({
  executionIds,
  apiUrl = '/api/v1',
}: ExecutionComparisonProps) {
  const [executions, setExecutions] = useState<[Execution | null, Execution | null]>([
    null,
    null,
  ]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'steps' | 'diff' | 'metrics'>('steps');

  useEffect(() => {
    fetchExecutions();
  }, [executionIds]);

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        executionIds.map(async (id) => {
          const response = await fetch(`${apiUrl}/executions/${id}`);
          if (response.ok) {
            return response.json();
          }
          return null;
        })
      );
      setExecutions(results as [Execution | null, Execution | null]);
    } catch (error) {
      console.error('Failed to fetch executions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const [exec1, exec2] = executions;

  if (!exec1 || !exec2) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>Could not load one or both executions.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Execution Comparison</h1>
        <div className="flex gap-2">
          {['steps', 'diff', 'metrics'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode as any)}
              className={`px-3 py-1.5 rounded text-sm ${
                viewMode === mode
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Header comparison */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <ExecutionHeader execution={exec1} label="Execution A" />
        <ExecutionHeader execution={exec2} label="Execution B" />
      </div>

      {/* Content based on view mode */}
      {viewMode === 'steps' && <StepsComparison exec1={exec1} exec2={exec2} />}
      {viewMode === 'diff' && <DiffView exec1={exec1} exec2={exec2} />}
      {viewMode === 'metrics' && <MetricsComparison exec1={exec1} exec2={exec2} />}
    </div>
  );
}

function ExecutionHeader({
  execution,
  label,
}: {
  execution: Execution;
  label: string;
}) {
  const passedSteps = execution.steps.filter((s) => s.status === 'passed').length;
  const failedSteps = execution.steps.filter((s) => s.status === 'failed').length;

  return (
    <div
      className={`border rounded-lg p-4 ${
        execution.status === 'passed' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{label}</span>
        <StatusBadge status={execution.status} />
      </div>
      <p className="font-medium mb-1">{execution.flowName}</p>
      <p className="text-sm text-gray-500 mb-2">ID: {execution.id.slice(0, 8)}</p>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" /> {execution.duration}ms
        </span>
        <span className="text-green-600">{passedSteps} passed</span>
        <span className="text-red-600">{failedSteps} failed</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'passed') {
    return (
      <span className="flex items-center gap-1 text-green-700 bg-green-100 px-2 py-0.5 rounded text-sm">
        <Check className="w-3 h-3" /> Passed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-red-700 bg-red-100 px-2 py-0.5 rounded text-sm">
      <X className="w-3 h-3" /> Failed
    </span>
  );
}

function StepsComparison({
  exec1,
  exec2,
}: {
  exec1: Execution;
  exec2: Execution;
}) {
  // Align steps by name
  const allStepNames = new Set([
    ...exec1.steps.map((s) => s.name),
    ...exec2.steps.map((s) => s.name),
  ]);

  const getStep = (exec: Execution, name: string) =>
    exec.steps.find((s) => s.name === name);

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium">Step</th>
            <th className="px-4 py-2 text-center text-sm font-medium w-24">A Status</th>
            <th className="px-4 py-2 text-center text-sm font-medium w-24">A Time</th>
            <th className="px-4 py-2 text-center text-sm font-medium w-8" />
            <th className="px-4 py-2 text-center text-sm font-medium w-24">B Status</th>
            <th className="px-4 py-2 text-center text-sm font-medium w-24">B Time</th>
            <th className="px-4 py-2 text-center text-sm font-medium w-24">Diff</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(allStepNames).map((name) => {
            const step1 = getStep(exec1, name);
            const step2 = getStep(exec2, name);
            const timeDiff = (step1?.duration || 0) - (step2?.duration || 0);
            const statusChanged = step1?.status !== step2?.status;

            return (
              <tr
                key={name}
                className={`border-t ${statusChanged ? 'bg-yellow-50' : ''}`}
              >
                <td className="px-4 py-2 text-sm">{name}</td>
                <td className="px-4 py-2 text-center">
                  {step1 ? (
                    <StepStatusIcon status={step1.status} />
                  ) : (
                    <Minus className="w-4 h-4 text-gray-300 mx-auto" />
                  )}
                </td>
                <td className="px-4 py-2 text-center text-sm text-gray-500">
                  {step1?.duration || '-'}ms
                </td>
                <td className="px-4 py-2 text-center">
                  <ArrowRight className="w-4 h-4 text-gray-300 mx-auto" />
                </td>
                <td className="px-4 py-2 text-center">
                  {step2 ? (
                    <StepStatusIcon status={step2.status} />
                  ) : (
                    <Minus className="w-4 h-4 text-gray-300 mx-auto" />
                  )}
                </td>
                <td className="px-4 py-2 text-center text-sm text-gray-500">
                  {step2?.duration || '-'}ms
                </td>
                <td className="px-4 py-2 text-center">
                  <TimeDiff diff={timeDiff} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StepStatusIcon({ status }: { status: string }) {
  if (status === 'passed') {
    return <Check className="w-4 h-4 text-green-500 mx-auto" />;
  }
  return <X className="w-4 h-4 text-red-500 mx-auto" />;
}

function TimeDiff({ diff }: { diff: number }) {
  if (diff === 0) return <span className="text-gray-400">-</span>;

  const color = diff > 0 ? 'text-red-500' : 'text-green-500';
  const sign = diff > 0 ? '+' : '';

  return (
    <span className={`text-sm ${color}`}>
      {sign}{diff}ms
    </span>
  );
}

function DiffView({ exec1, exec2 }: { exec1: Execution; exec2: Execution }) {
  const changes: { type: string; field: string; oldValue: any; newValue: any }[] = [];

  // Compare status
  if (exec1.status !== exec2.status) {
    changes.push({
      type: 'modified',
      field: 'Status',
      oldValue: exec1.status,
      newValue: exec2.status,
    });
  }

  // Compare steps
  exec1.steps.forEach((step1) => {
    const step2 = exec2.steps.find((s) => s.name === step1.name);
    if (!step2) {
      changes.push({
        type: 'removed',
        field: `Step: ${step1.name}`,
        oldValue: step1.status,
        newValue: null,
      });
    } else if (step1.status !== step2.status) {
      changes.push({
        type: 'modified',
        field: `Step: ${step1.name}`,
        oldValue: step1.status,
        newValue: step2.status,
      });
    }
  });

  exec2.steps.forEach((step2) => {
    const step1 = exec1.steps.find((s) => s.name === step2.name);
    if (!step1) {
      changes.push({
        type: 'added',
        field: `Step: ${step2.name}`,
        oldValue: null,
        newValue: step2.status,
      });
    }
  });

  return (
    <div className="border rounded-lg">
      {changes.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
          No differences found
        </div>
      ) : (
        <div className="divide-y">
          {changes.map((change, index) => (
            <div key={index} className="flex items-center p-3 gap-4">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  change.type === 'added'
                    ? 'bg-green-100 text-green-700'
                    : change.type === 'removed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {change.type}
              </span>
              <span className="font-medium">{change.field}</span>
              <span className="text-gray-400">
                {change.oldValue && (
                  <span className="line-through text-red-500">{change.oldValue}</span>
                )}
                {change.oldValue && change.newValue && ' → '}
                {change.newValue && (
                  <span className="text-green-500">{change.newValue}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricsComparison({
  exec1,
  exec2,
}: {
  exec1: Execution;
  exec2: Execution;
}) {
  const metrics = [
    {
      name: 'Total Duration',
      a: exec1.duration,
      b: exec2.duration,
      unit: 'ms',
    },
    {
      name: 'Passed Steps',
      a: exec1.steps.filter((s) => s.status === 'passed').length,
      b: exec2.steps.filter((s) => s.status === 'passed').length,
      unit: '',
    },
    {
      name: 'Failed Steps',
      a: exec1.steps.filter((s) => s.status !== 'passed').length,
      b: exec2.steps.filter((s) => s.status !== 'passed').length,
      unit: '',
    },
    {
      name: 'Avg Step Duration',
      a: Math.round(exec1.duration / exec1.steps.length),
      b: Math.round(exec2.duration / exec2.steps.length),
      unit: 'ms',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {metrics.map((metric) => {
        const diff = metric.b - metric.a;
        const percentChange = metric.a > 0 ? ((diff / metric.a) * 100).toFixed(1) : 0;

        return (
          <div key={metric.name} className="border rounded-lg p-4">
            <h3 className="text-sm text-gray-500 mb-2">{metric.name}</h3>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-bold">
                {metric.b}
                <span className="text-sm text-gray-400">{metric.unit}</span>
              </div>
              <div
                className={`text-sm ${
                  diff > 0 ? 'text-red-500' : diff < 0 ? 'text-green-500' : 'text-gray-400'
                }`}
              >
                {diff > 0 ? '+' : ''}
                {diff}
                {metric.unit} ({percentChange}%)
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
              <span>A: {metric.a}{metric.unit}</span>
              <ArrowRight className="w-3 h-3" />
              <span>B: {metric.b}{metric.unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ExecutionComparison;
