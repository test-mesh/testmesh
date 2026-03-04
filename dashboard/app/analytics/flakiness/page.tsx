'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FlakinessTable } from '@/components/analytics/FlakinessTable';
import { useFlakiness } from '@/lib/hooks/useReports';
import { ArrowLeft, Search, AlertTriangle, HelpCircle } from 'lucide-react';
import type { GetFlakinessResponse, FlakinessMetric } from '@/lib/api/types';

export default function FlakinessPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading, error } = useFlakiness({
    limit,
    offset: page * limit,
  });

  const flakyFlows = (data as GetFlakinessResponse)?.flaky_flows || [];
  const total = (data as GetFlakinessResponse)?.total || 0;

  const filteredFlows = searchQuery
    ? flakyFlows.filter(
        (f: FlakinessMetric) =>
          f.flow?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.flow_id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : flakyFlows;

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/analytics">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Flaky Tests</h1>
          <p className="text-muted-foreground mt-1">
            Tests with inconsistent pass/fail patterns
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="mb-6 border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20">
        <CardContent className="flex items-start gap-4 pt-6">
          <HelpCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-800 dark:text-yellow-200">
              What is a flaky test?
            </h3>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              A flaky test is one that produces inconsistent results (sometimes passing, sometimes
              failing) without any code changes. The flakiness score is calculated based on how
              often the test result changes (transitions) and how close the pass rate is to 50%.
              Higher scores indicate more unreliable tests that need attention.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by flow name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {total} flaky tests detected
        </div>
      </div>

      {/* Flaky Tests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Flaky Test Results
          </CardTitle>
          <CardDescription>
            Tests ordered by flakiness score (highest first)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">
              Failed to load flakiness data
            </div>
          ) : (
            <>
              <FlakinessTable data={filteredFlows} />

              {/* Pagination */}
              {total > limit && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage(p => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(page + 1) * limit >= total}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Tips for Fixing Flaky Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground">1.</span>
              Check for race conditions or timing issues in async operations
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground">2.</span>
              Ensure proper test isolation - each test should be independent
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground">3.</span>
              Avoid relying on external services without proper mocking
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground">4.</span>
              Use explicit waits instead of fixed sleep times
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground">5.</span>
              Consider using retry mechanisms for network operations
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
