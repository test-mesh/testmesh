'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFlows, useDeleteFlow } from '@/lib/hooks/useFlows';
import { useCreateExecution } from '@/lib/hooks/useExecutions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Play, Trash2, Eye, Plus, X, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 5;

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

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this flow?')) {
      deleteFlow.mutate(id);
    }
  };

  const handleRun = async (flowId: string) => {
    createExecution.mutate({
      flow_id: flowId,
      environment: 'development',
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

    const matchesTag = !tagFilter || flow.tags?.some(tag =>
      tag.toLowerCase().includes(tagFilter.toLowerCase())
    );

    return matchesSearch && matchesSuite && matchesTag;
  });

  const hasActiveFilters = searchQuery || suiteFilter || tagFilter;
  const clearFilters = () => {
    setSearchQuery('');
    setSuiteFilter('');
    setTagFilter('');
    resetPage();
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Flows</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'An error occurred'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Test Flows</h1>
          <p className="text-muted-foreground mt-1">
            Manage and execute your test flows
          </p>
        </div>
        <Link href="/flows/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Flow
          </Button>
        </Link>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search flows by name or description..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); resetPage(); }}
                  className="pl-10"
                />
              </div>
              <Input
                placeholder="Filter by suite..."
                value={suiteFilter}
                onChange={(e) => { setSuiteFilter(e.target.value); resetPage(); }}
                className="w-64"
              />
              <Input
                placeholder="Filter by tag..."
                value={tagFilter}
                onChange={(e) => { setTagFilter(e.target.value); resetPage(); }}
                className="w-64"
              />
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearFilters}
                  title="Clear filters"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {hasActiveFilters && (
              <div className="flex gap-2 items-center text-sm text-muted-foreground">
                <span>Active filters:</span>
                {searchQuery && (
                  <Badge variant="secondary" className="gap-1">
                    Search: {searchQuery}
                    <button
                      onClick={() => { setSearchQuery(''); resetPage(); }}
                      className="ml-1 hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {suiteFilter && (
                  <Badge variant="secondary" className="gap-1">
                    Suite: {suiteFilter}
                    <button
                      onClick={() => { setSuiteFilter(''); resetPage(); }}
                      className="ml-1 hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {tagFilter && (
                  <Badge variant="secondary" className="gap-1">
                    Tag: {tagFilter}
                    <button
                      onClick={() => { setTagFilter(''); resetPage(); }}
                      className="ml-1 hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              Loading flows...
            </div>
          </CardContent>
        </Card>
      ) : filteredFlows.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                {flows.length === 0 ? 'No flows found' : 'No flows match your search'}
              </p>
              <Link href="/flows/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Flow
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Suite</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFlows.map((flow) => (
                <TableRow key={flow.id}>
                  <TableCell>
                    <Link
                      href={`/flows/${flow.id}`}
                      className="font-medium hover:underline"
                    >
                      {flow.name}
                    </Link>
                    {flow.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {flow.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {flow.suite && (
                      <Badge variant="outline">{flow.suite}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {flow.tags?.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{flow.definition.steps?.length || 0}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{flow.environment}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRun(flow.id)}
                        disabled={createExecution.isPending}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                      <Link href={`/flows/${flow.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(flow.id)}
                        disabled={deleteFlow.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} flows
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p - 1)}
                disabled={page === 0}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span className="text-sm">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages - 1}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
