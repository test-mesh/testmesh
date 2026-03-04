'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SuggestionCard } from '@/components/ai/SuggestionCard';
import { useFlows } from '@/lib/hooks/useFlows';
import {
  useSuggestions,
  useAcceptSuggestion,
  useRejectSuggestion,
  useApplySuggestion,
} from '@/lib/hooks/useAI';
import { ArrowLeft, Lightbulb, Search, Loader2 } from 'lucide-react';
import type { SuggestionStatus } from '@/lib/api/types';

export default function SuggestionsPage() {
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | ''>('');

  const { data: flowsData, isLoading: flowsLoading } = useFlows({});
  const {
    data: suggestionsData,
    isLoading: suggestionsLoading,
    refetch,
  } = useSuggestions(
    selectedFlowId,
    statusFilter || undefined
  );

  const acceptSuggestion = useAcceptSuggestion();
  const rejectSuggestion = useRejectSuggestion();
  const applySuggestion = useApplySuggestion();

  const flows = flowsData?.flows || [];
  const suggestions = suggestionsData?.suggestions || [];

  const handleAccept = async (id: string) => {
    await acceptSuggestion.mutateAsync(id);
    refetch();
  };

  const handleReject = async (id: string) => {
    await rejectSuggestion.mutateAsync(id);
    refetch();
  };

  const handleApply = async (id: string) => {
    await applySuggestion.mutateAsync(id);
    refetch();
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/ai">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Lightbulb className="h-8 w-8" />
            AI Suggestions
          </h1>
          <p className="text-muted-foreground mt-1">
            Review and apply AI-generated suggestions for your test flows
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Select Flow</Label>
              <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a flow..." />
                </SelectTrigger>
                <SelectContent>
                  {flowsLoading ? (
                    <SelectItem value="" disabled>
                      Loading flows...
                    </SelectItem>
                  ) : flows.length === 0 ? (
                    <SelectItem value="" disabled>
                      No flows found
                    </SelectItem>
                  ) : (
                    flows.map((flow) => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as SuggestionStatus | '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={!selectedFlowId || suggestionsLoading}
              >
                {suggestionsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2">Search</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suggestions List */}
      {!selectedFlowId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Select a Flow</h3>
            <p className="text-muted-foreground text-center mt-1">
              Choose a flow to view its AI-generated suggestions
            </p>
          </CardContent>
        </Card>
      ) : suggestionsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : suggestions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Suggestions</h3>
            <p className="text-muted-foreground text-center mt-1">
              No AI suggestions found for this flow
              {statusFilter && ` with status "${statusFilter}"`}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Run a failed execution and analyze it to generate suggestions
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} found
          </p>
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={() => handleAccept(suggestion.id)}
              onReject={() => handleReject(suggestion.id)}
              onApply={() => handleApply(suggestion.id)}
              isApplying={applySuggestion.isPending}
            />
          ))}
        </div>
      )}

      {/* Info Card */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">How AI Suggestions Work</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>When a test execution fails, you can trigger AI analysis from the execution details page</li>
            <li>The AI examines the error messages, outputs, and flow structure</li>
            <li>It generates suggestions with fixes, optimizations, or improvements</li>
            <li>Review each suggestion, accept or reject it, then apply accepted suggestions</li>
            <li>Applied suggestions automatically update your flow definition</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
