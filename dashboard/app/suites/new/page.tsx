'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateSuite } from '@/lib/hooks/useSuites';
import { useFlows } from '@/lib/hooks/useFlows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Layers,
  Search,
} from 'lucide-react';
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
    const nextOrder =
      flowEntries.length > 0 ? Math.max(...flowEntries.map((e) => e.order)) + 1 : 1;
    setFlowEntries((prev) => [
      ...prev,
      { flow_id: flowId, flow_name: flowName, order: nextOrder, parallel: false },
    ]);
    setFlowSearch('');
  };

  const removeFlow = (flowId: string) => {
    setFlowEntries((prev) => {
      const filtered = prev.filter((e) => e.flow_id !== flowId);
      // Re-number orders
      return filtered.map((e, i) => ({ ...e, order: i + 1 }));
    });
  };

  const updateOrder = (flowId: string, order: number) => {
    setFlowEntries((prev) =>
      prev.map((e) => (e.flow_id === flowId ? { ...e, order: Math.max(1, order) } : e))
    );
  };

  const toggleParallel = (flowId: string, value: boolean) => {
    setFlowEntries((prev) =>
      prev.map((e) => (e.flow_id === flowId ? { ...e, parallel: value } : e))
    );
  };

  const sortedEntries = [...flowEntries].sort((a, b) => a.order - b.order);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const suite = await createMutation.mutateAsync({
      name,
      description: description || undefined,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      flows: flowEntries.map(({ flow_id, order, parallel }) => ({
        flow_id,
        order,
        parallel,
      })),
    });

    router.push(`/suites/${suite.id}`);
  };

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/suites">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Suites
          </Button>
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Create Suite
            </CardTitle>
            <CardDescription>
              Group multiple flows into an ordered suite for coordinated execution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Suite Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Full Regression Suite"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this suite tests..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., regression, critical, smoke"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Flows</CardTitle>
            <CardDescription>
              Add flows to this suite and configure their execution order
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Flow picker */}
            <div className="space-y-2">
              <Label>Add Flow</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search flows..."
                    value={flowSearch}
                    onChange={(e) => setFlowSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              {flowSearch && availableFlows.length > 0 && (
                <div className="border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                  {availableFlows.slice(0, 10).map((flow) => (
                    <button
                      key={flow.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                      onClick={() => addFlow(flow.id, flow.name)}
                    >
                      <Plus className="h-3 w-3 text-muted-foreground" />
                      {flow.name}
                    </button>
                  ))}
                </div>
              )}
              {flowSearch && availableFlows.length === 0 && (
                <p className="text-sm text-muted-foreground px-1">No matching flows found.</p>
              )}
            </div>

            {/* Flow list */}
            {sortedEntries.length > 0 ? (
              <div className="space-y-2">
                <Label>Flow Order</Label>
                {sortedEntries.map((entry) => (
                  <div
                    key={entry.flow_id}
                    className="flex items-center gap-3 p-3 rounded-md border bg-card"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="w-16 flex-shrink-0">
                      <Input
                        type="number"
                        min={1}
                        value={entry.order}
                        onChange={(e) => updateOrder(entry.flow_id, parseInt(e.target.value) || 1)}
                        className="h-7 text-sm text-center"
                      />
                    </div>
                    <span className="flex-1 text-sm font-medium truncate">{entry.flow_name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Label htmlFor={`parallel-${entry.flow_id}`} className="text-xs text-muted-foreground">
                        Parallel
                      </Label>
                      <Switch
                        id={`parallel-${entry.flow_id}`}
                        checked={entry.parallel}
                        onCheckedChange={(v) => toggleParallel(entry.flow_id, v)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFlow(entry.flow_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground border rounded-md">
                <Layers className="mx-auto h-8 w-8 mb-2" />
                <p className="text-sm">Search for flows above to add them to this suite.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Link href="/suites">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={createMutation.isPending || !name || flowEntries.length === 0}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Suite'}
          </Button>
        </div>
      </form>
    </div>
  );
}
