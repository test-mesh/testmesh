'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useContracts, useDeleteContract, useExportPact } from '@/lib/hooks/useContracts';
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
import { Eye, Trash2, X, Search, FileText, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const PAGE_SIZE = 5;

export default function ContractsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [consumerFilter, setConsumerFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [page, setPage] = useState(0);

  const resetPage = () => setPage(0);

  const { data, isLoading, error } = useContracts({
    consumer: consumerFilter || undefined,
    provider: providerFilter || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const deleteContract = useDeleteContract();
  const exportPact = useExportPact();

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this contract?')) {
      deleteContract.mutate(id);
    }
  };

  const handleExport = async (id: string) => {
    exportPact.mutate(id);
  };

  const contracts = data?.contracts || [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch =
      contract.consumer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.version.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const hasActiveFilters = searchQuery || consumerFilter || providerFilter;
  const clearFilters = () => {
    setSearchQuery('');
    setConsumerFilter('');
    setProviderFilter('');
    resetPage();
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Contracts</CardTitle>
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
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="w-8 h-8" />
            Contract Testing
          </h1>
          <p className="text-muted-foreground mt-1">
            Pact-compatible consumer-driven contracts
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search contracts..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); resetPage(); }}
                  className="pl-10"
                />
              </div>
              <Input
                placeholder="Filter by consumer..."
                value={consumerFilter}
                onChange={(e) => { setConsumerFilter(e.target.value); resetPage(); }}
                className="w-64"
              />
              <Input
                placeholder="Filter by provider..."
                value={providerFilter}
                onChange={(e) => { setProviderFilter(e.target.value); resetPage(); }}
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
                      onClick={() => setSearchQuery('')}
                      className="ml-1 hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {consumerFilter && (
                  <Badge variant="secondary" className="gap-1">
                    Consumer: {consumerFilter}
                    <button
                      onClick={() => setConsumerFilter('')}
                      className="ml-1 hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {providerFilter && (
                  <Badge variant="secondary" className="gap-1">
                    Provider: {providerFilter}
                    <button
                      onClick={() => setProviderFilter('')}
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
            <div className="text-center text-muted-foreground">Loading contracts...</div>
          </CardContent>
        </Card>
      ) : filteredContracts.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">
                {contracts.length === 0 ? 'No contracts found' : 'No contracts match your search'}
              </p>
              <p className="text-sm text-muted-foreground">
                Contracts are generated from flows with{' '}
                <code className="bg-muted px-1 py-0.5 rounded">contract_generate</code> actions
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Consumer</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Interactions</TableHead>
                <TableHead>Pact Version</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell>
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="font-medium hover:underline"
                    >
                      {contract.consumer}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{contract.provider}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{contract.version}</Badge>
                  </TableCell>
                  <TableCell>
                    {contract.contract_data.interactions?.length || 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{contract.pact_version}</Badge>
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(contract.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExport(contract.id)}
                        disabled={exportPact.isPending}
                        title="Export as Pact JSON"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Link href={`/contracts/${contract.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(contract.id)}
                        disabled={deleteContract.isPending}
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
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} contracts
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
              <span>Page {page + 1} of {totalPages}</span>
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
