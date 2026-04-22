'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSuite, useUpdateSuite } from '@/lib/hooks/useSuites';
import { useFlows } from '@/lib/hooks/useFlows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Layers,
  Search,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface FlowEntry {
  flow_id: string;
  flow_name: string;
  order: number;
  parallel: boolean;
}

export default function SuiteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: suite, isLoading, error } = useSuite(id);
  const { data: flowsData } = useFlows({ limit: 100 });
  const updateMutation = useUpdateSuite();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [flowEntries, setFlowEntries] = useState<FlowEntry[]>([]);
  const [flowSearch, setFlowSearch] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Initialize form with existing suite data
  useEffect(() => {
    if (suite && !initialized) {
      setName(suite.name);
      setDescription(suite.description || '');
      setTags(suite.tags?.join(', ') || '');
      setFlowEntries(
        (suite.flows ?? [])
          .sort((a, b) => a.order - b.order)
          .map((sf) => ({
            flow_id: sf.flow_id,
            flow_name: sf.flow?.name ?? sf.flow_id,
            order: sf.order,
            parallel: sf.parallel,
          }))
      );
      setInitialized(true);
    }
  }, [suite, initialized]);

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

    await updateMutation.mutateAsync({
      id,
      data: {
        name,
        description: description || undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        flows: flowEntries.map(({ flow_id, order, parallel }) => ({
          flow_id,
          order,
          parallel,
        })),
      },
    });

    router.push(`/suites/${id}`);
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Failed to load suite. It may have been deleted.</p>
            <Link href="/suites">
              <Button className="mt-4">Back to Suites</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !suite) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="mb-6">
        <Link href={`/suites/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Suite
          </Button>
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Edit Suite
            </CardTitle>
            <CardDescription>Modify the suite configuration</CardDescription>
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
              Configure which flows run and in what order
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Flow picker */}
            <div className="space-y-2">
              <Label>Add Flow</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search flows to add..."
                  value={flowSearch}
                  onChange={(e) => setFlowSearch(e.target.value)}
                  className="pl-10"
                />
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
                        onChange={(e) =>
                          updateOrder(entry.flow_id, parseInt(e.target.value) || 1)
                        }
                        className="h-7 text-sm text-center"
                      />
                    </div>
                    <span className="flex-1 text-sm font-medium truncate">{entry.flow_name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Label
                        htmlFor={`parallel-${entry.flow_id}`}
                        className="text-xs text-muted-foreground"
                      >
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
          <Link href={`/suites/${id}`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={updateMutation.isPending || !name || flowEntries.length === 0}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
