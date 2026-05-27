'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateSuite } from '@/lib/hooks/useSuites';
import { useFlows } from '@/lib/hooks/useFlows';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Plus, Trash2, GripVertical, Layers, Search, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface FlowEntry {
  flow_id: string;
  flow_name: string;
  order: number;
  parallel: boolean;
}

export default function NewSuitePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [flowEntries, setFlowEntries] = useState<FlowEntry[]>([]);
  const [flowSearch, setFlowSearch] = useState('');

  const { data: flowsData } = useFlows({ limit: 100 });
  const createMutation = useCreateSuite();

  const availableFlows = flowsData?.flows?.filter(
    (f) =>
      f.name.toLowerCase().includes(flowSearch.toLowerCase()) &&
      !flowEntries.some((e) => e.flow_id === f.id)
  ) ?? [];

  const addFlow = (flowId: string, flowName: string) => {
    const nextOrder = flowEntries.length > 0 ? Math.max(...flowEntries.map((e) => e.order)) + 1 : 1;
    setFlowEntries((prev) => [...prev, { flow_id: flowId, flow_name: flowName, order: nextOrder, parallel: false }]);
    setFlowSearch('');
  };

  const removeFlow = (flowId: string) => {
    setFlowEntries((prev) => {
      const filtered = prev.filter((e) => e.flow_id !== flowId);
      return filtered.map((e, i) => ({ ...e, order: i + 1 }));
    });
  };

  const updateOrder = (flowId: string, order: number) => {
    setFlowEntries((prev) => prev.map((e) => (e.flow_id === flowId ? { ...e, order: Math.max(1, order) } : e)));
  };

  const toggleParallel = (flowId: string, value: boolean) => {
    setFlowEntries((prev) => prev.map((e) => (e.flow_id === flowId ? { ...e, parallel: value } : e)));
  };

  const sortedEntries = [...flowEntries].sort((a, b) => a.order - b.order);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const suite = await createMutation.mutateAsync({
      name,
      description: description || undefined,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      flows: flowEntries.map(({ flow_id, order, parallel }) => ({ flow_id, order, parallel })),
    });
    router.push(`/suites/${suite.id}`);
  };

  return (
    <div className="px-6 py-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-5">
        <Link
          href="/suites"
          className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#3d5670]" />
          <h1 className="text-xl font-semibold text-[#c8dce8]">Create Suite</h1>
        </div>
        <p className="text-xs text-[#3d5670] mt-0.5">Group multiple flows into an ordered suite</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Basic info */}
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Suite Details</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-[11px] text-[#7fa8c8]">Suite Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Full Regression Suite" required
                className="h-8 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670] focus-visible:ring-0 focus-visible:border-teal-400/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-[11px] text-[#7fa8c8]">Description (optional)</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this suite tests..." rows={2}
                className="text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670] focus-visible:ring-0 focus-visible:border-teal-400/50 resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tags" className="text-[11px] text-[#7fa8c8]">Tags (comma-separated)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., regression, critical, smoke"
                className="h-8 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670] focus-visible:ring-0 focus-visible:border-teal-400/50"
              />
            </div>
          </div>
        </div>

        {/* Flows */}
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Flows</span>
            <span className="text-[10px] text-[#4a6480] ml-2">add flows and configure execution order</span>
          </div>
          <div className="p-4 space-y-3">
            {/* Flow search */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-[#7fa8c8]">Add Flow</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[#3d5670]" />
                <input
                  placeholder="Search flows..."
                  value={flowSearch}
                  onChange={(e) => setFlowSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#0b0f18] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
                />
              </div>
              {flowSearch && availableFlows.length > 0 && (
                <div className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] max-h-48 overflow-y-auto">
                  {availableFlows.slice(0, 10).map((flow) => (
                    <button
                      key={flow.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-[#c8dce8] hover:bg-[#1a2d3d] flex items-center gap-2 transition-colors"
                      onClick={() => addFlow(flow.id, flow.name)}
                    >
                      <Plus className="h-3 w-3 text-teal-400 shrink-0" />
                      {flow.name}
                    </button>
                  ))}
                </div>
              )}
              {flowSearch && availableFlows.length === 0 && (
                <p className="text-xs text-[#4a6480] px-1">No matching flows found.</p>
              )}
            </div>

            {/* Flow list */}
            {sortedEntries.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-[11px] text-[#7fa8c8]">Flow Order</Label>
                {sortedEntries.map((entry) => (
                  <div key={entry.flow_id} className="flex items-center gap-2 p-2.5 rounded-lg border border-[#1e2d3d] bg-[#0b0f18]">
                    <GripVertical className="h-3.5 w-3.5 text-[#3d5670] shrink-0" />
                    <input
                      type="number" min={1} value={entry.order}
                      onChange={(e) => updateOrder(entry.flow_id, parseInt(e.target.value) || 1)}
                      className="w-12 h-6 text-center text-xs rounded bg-[#1a2d3d] border border-[#2a3d52] text-[#c8dce8] focus:outline-none focus:border-teal-400/50"
                    />
                    <span className="flex-1 text-xs font-medium text-[#c8dce8] truncate">{entry.flow_name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-[#4a6480]">Parallel</span>
                      <Switch
                        id={`parallel-${entry.flow_id}`}
                        checked={entry.parallel}
                        onCheckedChange={(v) => toggleParallel(entry.flow_id, v)}
                        className="scale-75"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFlow(entry.flow_id)}
                      className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-dashed border-[#1e2d3d] text-center">
                <Layers className="h-7 w-7 mb-2 text-[#1e2d3d]" />
                <p className="text-xs text-[#3d5670]">Search for flows above to add them.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Link
            href="/suites"
            className="flex items-center h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending || !name || flowEntries.length === 0}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {createMutation.isPending ? <><RefreshCw className="h-3 w-3 animate-spin" />Creating…</> : 'Create Suite'}
          </button>
        </div>
      </form>
    </div>
  );
}
