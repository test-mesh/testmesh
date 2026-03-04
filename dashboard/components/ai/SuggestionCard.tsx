'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Check,
  X,
  ChevronDown,
  Lightbulb,
  Wrench,
  Zap,
  Timer,
  AlertCircle,
} from 'lucide-react';
import type { Suggestion, SuggestionType } from '@/lib/api/types';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onAccept?: () => void;
  onReject?: () => void;
  onApply?: () => void;
  isApplying?: boolean;
}

const TYPE_ICONS: Record<SuggestionType, React.ReactNode> = {
  fix: <Wrench className="h-4 w-4" />,
  optimization: <Zap className="h-4 w-4" />,
  retry_strategy: <Timer className="h-4 w-4" />,
  assertion: <AlertCircle className="h-4 w-4" />,
  timeout: <Timer className="h-4 w-4" />,
};

const TYPE_LABELS: Record<SuggestionType, string> = {
  fix: 'Fix',
  optimization: 'Optimization',
  retry_strategy: 'Retry Strategy',
  assertion: 'Assertion',
  timeout: 'Timeout',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  rejected: 'bg-gray-100 text-gray-800',
  applied: 'bg-green-100 text-green-800',
};

export function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  onApply,
  isApplying = false,
}: SuggestionCardProps) {
  const confidencePercent = Math.round(suggestion.confidence * 100);
  const confidenceColor =
    confidencePercent >= 80
      ? 'text-green-600'
      : confidencePercent >= 50
      ? 'text-yellow-600'
      : 'text-red-600';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {TYPE_ICONS[suggestion.type]}
            <CardTitle className="text-lg">{suggestion.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {TYPE_LABELS[suggestion.type]}
            </Badge>
            <Badge className={STATUS_COLORS[suggestion.status]}>
              {suggestion.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Confidence */}
        <div className="flex items-center gap-2 text-sm">
          <Lightbulb className="h-4 w-4 text-muted-foreground" />
          <span>Confidence:</span>
          <span className={`font-medium ${confidenceColor}`}>
            {confidencePercent}%
          </span>
        </div>

        {/* Description */}
        {suggestion.description && (
          <p className="text-sm text-muted-foreground">{suggestion.description}</p>
        )}

        {/* Reasoning */}
        {suggestion.reasoning && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
              <ChevronDown className="h-4 w-4" />
              Why this suggestion?
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                {suggestion.reasoning}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* YAML Preview */}
        {suggestion.suggested_yaml && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
              <ChevronDown className="h-4 w-4" />
              View suggested changes
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-64">
                <code>{suggestion.suggested_yaml}</code>
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Diff */}
        {suggestion.diff_patch && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
              <ChevronDown className="h-4 w-4" />
              View diff
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">
                <code
                  dangerouslySetInnerHTML={{ __html: suggestion.diff_patch }}
                />
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Actions */}
        {suggestion.status === 'pending' && (
          <div className="flex items-center gap-2 pt-2">
            {onAccept && (
              <Button variant="outline" size="sm" onClick={onAccept}>
                <Check className="h-4 w-4 mr-1" />
                Accept
              </Button>
            )}
            {onReject && (
              <Button variant="ghost" size="sm" onClick={onReject}>
                <X className="h-4 w-4 mr-1" />
                Reject
              </Button>
            )}
          </div>
        )}

        {suggestion.status === 'accepted' && onApply && (
          <Button onClick={onApply} disabled={isApplying}>
            {isApplying ? 'Applying...' : 'Apply Suggestion'}
          </Button>
        )}

        {suggestion.status === 'applied' && suggestion.applied_at && (
          <p className="text-sm text-muted-foreground">
            Applied on {new Date(suggestion.applied_at).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
