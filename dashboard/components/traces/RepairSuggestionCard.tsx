'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useApplyRepairSuggestion, useDismissRepairSuggestion } from '@/lib/hooks/useTelemetry';
import type { RepairSuggestion } from '@/lib/api/types';

interface Props {
  workspaceId: string;
  suggestion: RepairSuggestion;
}

export function RepairSuggestionCard({ workspaceId, suggestion }: Props) {
  const [showDiff, setShowDiff] = useState(false);
  const apply = useApplyRepairSuggestion();
  const dismiss = useDismissRepairSuggestion();

  if (suggestion.status !== 'pending') return null;

  const confidencePct = Math.round(suggestion.confidence * 100);

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 mb-4">
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-sm">Repair Suggestion</span>
          <Badge variant="outline" className="text-xs ml-auto">
            {confidencePct}% confidence
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
          {suggestion.diagnosis}
        </p>

        {suggestion.yaml_diff && (
          <div className="mb-3">
            <button
              onClick={() => setShowDiff(!showDiff)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showDiff ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showDiff ? 'Hide diff' : 'View diff'}
            </button>
            {showDiff && (
              <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
                {suggestion.yaml_diff}
              </pre>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => apply.mutate({ workspaceId, suggestionId: suggestion.id })}
            disabled={apply.isPending}
          >
            <Check className="w-3 h-3 mr-1" />
            Apply fix
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => dismiss.mutate({ workspaceId, suggestionId: suggestion.id })}
            disabled={dismiss.isPending}
          >
            <X className="w-3 h-3 mr-1" />
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
