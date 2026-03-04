'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Tag, AlertCircle, Play } from 'lucide-react';

interface TagRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: TagCondition[];
  tags: string[];
  priority: number;
}

interface TagCondition {
  field: string;
  operator: string;
  value: string;
}

const FIELDS = [
  { value: 'flow.name', label: 'Flow Name' },
  { value: 'flow.description', label: 'Flow Description' },
  { value: 'step.type', label: 'Step Type' },
  { value: 'step.url', label: 'Step URL' },
  { value: 'step.method', label: 'HTTP Method' },
  { value: 'environment', label: 'Environment' },
  { value: 'workspace', label: 'Workspace' },
];

const OPERATORS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'matches', label: 'Matches regex' },
  { value: 'not_contains', label: 'Does not contain' },
];

interface AutoTaggingRulesProps {
  apiUrl?: string;
}

export function AutoTaggingRules({ apiUrl = '/api/v1' }: AutoTaggingRulesProps) {
  const [rules, setRules] = useState<TagRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRule, setEditingRule] = useState<TagRule | null>(null);
  const [testResult, setTestResult] = useState<{ flowName: string; tags: string[] } | null>(null);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const response = await fetch(`${apiUrl}/settings/auto-tagging`);
      if (response.ok) {
        const data = await response.json();
        setRules(data.rules || []);
      }
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveRules = async () => {
    setSaving(true);
    try {
      await fetch(`${apiUrl}/settings/auto-tagging`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
    } catch (error) {
      console.error('Failed to save rules:', error);
    } finally {
      setSaving(false);
    }
  };

  const addRule = () => {
    const newRule: TagRule = {
      id: `rule_${Date.now()}`,
      name: 'New Rule',
      enabled: true,
      conditions: [{ field: 'flow.name', operator: 'contains', value: '' }],
      tags: [],
      priority: rules.length + 1,
    };
    setRules([...rules, newRule]);
    setEditingRule(newRule);
  };

  const updateRule = (ruleId: string, updates: Partial<TagRule>) => {
    setRules((prev) =>
      prev.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule))
    );
    if (editingRule?.id === ruleId) {
      setEditingRule({ ...editingRule, ...updates });
    }
  };

  const deleteRule = (ruleId: string) => {
    setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
    if (editingRule?.id === ruleId) {
      setEditingRule(null);
    }
  };

  const addCondition = (ruleId: string) => {
    updateRule(ruleId, {
      conditions: [
        ...(rules.find((r) => r.id === ruleId)?.conditions || []),
        { field: 'flow.name', operator: 'contains', value: '' },
      ],
    });
  };

  const removeCondition = (ruleId: string, index: number) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (rule) {
      updateRule(ruleId, {
        conditions: rule.conditions.filter((_, i) => i !== index),
      });
    }
  };

  const updateCondition = (ruleId: string, index: number, updates: Partial<TagCondition>) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (rule) {
      const newConditions = [...rule.conditions];
      newConditions[index] = { ...newConditions[index], ...updates };
      updateRule(ruleId, { conditions: newConditions });
    }
  };

  const testRule = async (ruleId: string) => {
    try {
      const response = await fetch(`${apiUrl}/settings/auto-tagging/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_id: ruleId }),
      });
      if (response.ok) {
        const data = await response.json();
        setTestResult(data);
      }
    } catch (error) {
      console.error('Failed to test rule:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Auto-Tagging Rules</h1>
          <p className="text-gray-600">
            Automatically tag flows and executions based on conditions.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={addRule}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Plus className="w-4 h-4" /> Add Rule
          </button>
          <button
            onClick={saveRules}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`border rounded-lg p-4 ${
              editingRule?.id === rule.id ? 'border-blue-500 bg-blue-50' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <input
                  type="text"
                  value={rule.name}
                  onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                  className="font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => testRule(rule.id)}
                  className="p-1.5 text-gray-500 hover:text-blue-500"
                  title="Test rule"
                >
                  <Play className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="p-1.5 text-gray-500 hover:text-red-500"
                  title="Delete rule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Conditions */}
            <div className="space-y-2 mb-3">
              <p className="text-sm text-gray-500">When:</p>
              {rule.conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  {index > 0 && <span className="text-sm text-gray-500">AND</span>}
                  <select
                    value={condition.field}
                    onChange={(e) =>
                      updateCondition(rule.id, index, { field: e.target.value })
                    }
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={condition.operator}
                    onChange={(e) =>
                      updateCondition(rule.id, index, { operator: e.target.value })
                    }
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {OPERATORS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={condition.value}
                    onChange={(e) =>
                      updateCondition(rule.id, index, { value: e.target.value })
                    }
                    placeholder="Value"
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                  {rule.conditions.length > 1 && (
                    <button
                      onClick={() => removeCondition(rule.id, index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => addCondition(rule.id)}
                className="text-sm text-blue-500 hover:text-blue-700"
              >
                + Add condition
              </button>
            </div>

            {/* Tags */}
            <div>
              <p className="text-sm text-gray-500 mb-1">Apply tags:</p>
              <div className="flex flex-wrap gap-2">
                {rule.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                    <button
                      onClick={() =>
                        updateRule(rule.id, {
                          tags: rule.tags.filter((_, i) => i !== index),
                        })
                      }
                      className="hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder="Add tag..."
                  className="border rounded px-2 py-0.5 text-sm w-24"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value && !rule.tags.includes(value)) {
                        updateRule(rule.id, { tags: [...rule.tags, value] });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        ))}

        {rules.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No auto-tagging rules configured.</p>
            <button
              onClick={addRule}
              className="mt-2 text-blue-500 hover:text-blue-700"
            >
              Create your first rule
            </button>
          </div>
        )}
      </div>

      {/* Test result modal */}
      {testResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Test Result</h3>
            <p className="text-sm text-gray-600 mb-2">
              Flow: <strong>{testResult.flowName}</strong>
            </p>
            <p className="text-sm text-gray-600 mb-2">Tags that would be applied:</p>
            <div className="flex flex-wrap gap-2">
              {testResult.tags.length > 0 ? (
                testResult.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-gray-500 text-sm">No tags matched</span>
              )}
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="mt-4 w-full px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AutoTaggingRules;
