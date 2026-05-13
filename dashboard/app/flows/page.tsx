'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFlows, useDeleteFlow } from '@/lib/hooks/useFlows';
import { useCreateExecution } from '@/lib/hooks/useExecutions';
import { useRunFlowForDebug } from '@/lib/hooks/useDebug';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Play,
  Trash2,
  Plus,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Upload,
  Sparkles,
  Zap,
  Bug,
  Layers,
} from 'lucide-react';

const PAGE_SIZE = 12;

function FlowCard({
  flow,
  onRun,
  onDebug,
  onDelete,
  isRunning,
  isDebugging,
  isDeleting,
}: {
  flow: any;
  onRun: (id: string) => void;
  onDebug: (id: string) => void;
  onDelete: (id: string) => void;
  isRunning: boolean;
  isDebugging: boolean;
  isDeleting: boolean;
}) {
  const stepCount = flow.definition.steps?.length ?? 0;

  return (
    <Card className="group flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/flows/${flow.id}`} className="hover:text-primary transition-colors">
              <CardTitle className="text-sm font-semibold leading-snug truncate">
                {flow.name}
              </CardTitle>
            </Link>
            {flow.description && (
              <CardDescription className="text-xs mt-1 line-clamp-2">
                {flow.description}
              </CardDescription>
            )}
          </div>
          <Badge variant="outline" className="text-xs shrink-0">{flow.environment}</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 gap-3 pb-3">
        {/* Tags */}
        <div className="flex flex-wrap gap-1 min-h-[20px]">
          {flow.suite && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{flow.suite}</Badge>
          )}
          {flow.tags?.map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
          ))}
        </div>

        {/* Step count */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-auto">
          <Layers className="w-3.5 h-3.5" />
          {stepCount} step{stepCount !== 1 ? 's' : ''}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-2 border-t">
          <Button
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => onRun(flow.id)}
            disabled={isRunning}
          >
            <Play className="w-3 h-3 mr-1" />
            Run
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onDebug(flow.id)}
            disabled={isDebugging}
            title="Debug"
          >
            <Bug className="w-3 h-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => onDelete(flow.id)}
            disabled={isDeleting}
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FlowsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [suiteFilter, setSuiteFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useFlows({
    suite: suiteFilter || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const deleteFlow = useDeleteFlow();
  const createExecution = useCreateExecution();
  const runFlowForDebug = useRunFlowForDebug();
  const router = useRouter();

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this flow?')) {
      deleteFlow.mutate(id);
    }
  };

  const handleRun = (flowId: string) => {
    createExecution.mutate({ flow_id: flowId, environment: 'development' });
  };

  const handleDebug = (flowId: string) => {
    runFlowForDebug.mutate(flowId, {
      onSuccess: (session) => router.push(`/debug?session=${session.execution_id}`),
    });
  };

  const resetPage = () => setPage(0);

  const flows = data?.flows || [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filteredFlows = flows.filter((flow) => {
    const matchesSearch =
      flow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flow.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSuite = !suiteFilter || flow.suite?.toLowerCase().includes(suiteFilter.toLowerCase());
    const matchesTag = !tagFilter || flow.tags?.some((tag: string) =>
      tag.toLowerCase().includes(tagFilter.toLowerCase())
    );
    return matchesSearch && matchesSuite && matchesTag;
  });

  const hasActiveFilters = searchQuery || suiteFilter || tagFilter;
  const clearFilters = () => { setSearchQuery(''); setSuiteFilter(''); setTagFilter(''); resetPage(); };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Flows</CardTitle>
            <CardDescription>{error instanceof Error ? error.message : 'An error occurred'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Test Flows</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage and execute your test flows</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/runner">
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Run with Data
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/import">
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Import
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/ai/generate">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Generate
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/flows/new">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create Flow
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search flows..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); resetPage(); }}
            className="pl-9 h-9"
          />
        </div>
        <Input
          placeholder="Suite..."
          value={suiteFilter}
          onChange={(e) => { setSuiteFilter(e.target.value); resetPage(); }}
          className="w-40 h-9"
        />
        <Input
          placeholder="Tag..."
          value={tagFilter}
          onChange={(e) => { setTagFilter(e.target.value); resetPage(); }}
          className="w-40 h-9"
        />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 px-2" onClick={clearFilters} title="Clear filters">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex gap-2 items-center mb-4 text-sm text-muted-foreground">
          <span>Filters:</span>
          {searchQuery && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => { setSearchQuery(''); resetPage(); }}>
              {searchQuery} <X className="w-3 h-3" />
            </Badge>
          )}
          {suiteFilter && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => { setSuiteFilter(''); resetPage(); }}>
              Suite: {suiteFilter} <X className="w-3 h-3" />
            </Badge>
          )}
          {tagFilter && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => { setTagFilter(''); resetPage(); }}>
              Tag: {tagFilter} <X className="w-3 h-3" />
            </Badge>
          )}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full mt-2" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredFlows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Layers className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm mb-4">
              {flows.length === 0 ? 'No flows yet' : 'No flows match your filters'}
            </p>
            <Button size="sm" asChild>
              <Link href="/flows/new">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create Your First Flow
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredFlows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              onRun={handleRun}
              onDebug={handleDebug}
              onDelete={handleDelete}
              isRunning={createExecution.isPending}
              isDebugging={runFlowForDebug.isPending}
              isDeleting={deleteFlow.isPending}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} flows
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <span>Page {page + 1} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
