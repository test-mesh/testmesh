'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Copy, FileText, Code, Clock, Zap } from 'lucide-react';
import type { FlowDefinition, AIProviderType } from '@/lib/api/types';

interface GeneratedFlowPreviewProps {
  yaml: string;
  flowDef?: FlowDefinition;
  tokensUsed?: number;
  latencyMs?: number;
  provider?: AIProviderType;
  model?: string;
  onSave?: () => void;
  onEdit?: () => void;
  isSaving?: boolean;
}

export function GeneratedFlowPreview({
  yaml,
  flowDef,
  tokensUsed,
  latencyMs,
  provider,
  model,
  onSave,
  onEdit,
  isSaving = false,
}: GeneratedFlowPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {flowDef?.name || 'Generated Flow'}
        </CardTitle>
        <div className="flex items-center gap-2">
          {provider && (
            <Badge variant="outline" className="capitalize">
              {provider}
            </Badge>
          )}
          {model && (
            <Badge variant="secondary" className="text-xs">
              {model}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metadata */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {tokensUsed && (
            <span className="flex items-center gap-1">
              <Zap className="h-4 w-4" />
              {tokensUsed} tokens
            </span>
          )}
          {latencyMs && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {(latencyMs / 1000).toFixed(2)}s
            </span>
          )}
          {flowDef?.steps && (
            <span>{flowDef.steps.length} steps</span>
          )}
        </div>

        {/* Description */}
        {flowDef?.description && (
          <p className="text-sm text-muted-foreground">{flowDef.description}</p>
        )}

        {/* Tags */}
        {flowDef?.tags && flowDef.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {flowDef.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Preview Tabs */}
        <Tabs defaultValue="yaml" className="w-full">
          <TabsList>
            <TabsTrigger value="yaml" className="gap-2">
              <Code className="h-4 w-4" />
              YAML
            </TabsTrigger>
            <TabsTrigger value="steps" className="gap-2">
              <FileText className="h-4 w-4" />
              Steps
            </TabsTrigger>
          </TabsList>

          <TabsContent value="yaml" className="mt-4">
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm max-h-96">
                <code>{yaml}</code>
              </pre>
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-2 right-2"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="steps" className="mt-4">
            {flowDef?.steps && flowDef.steps.length > 0 ? (
              <div className="space-y-2">
                {flowDef.steps.map((step, idx) => (
                  <div
                    key={step.id || idx}
                    className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                  >
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium">{step.name || step.id}</div>
                      <div className="text-sm text-muted-foreground">
                        <code className="bg-background px-1 rounded">{step.action}</code>
                        {step.description && ` - ${step.description}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No steps found in the flow definition
              </p>
            )}
          </TabsContent>
        </Tabs>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-4">
          {onSave && (
            <Button onClick={onSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Flow'}
            </Button>
          )}
          {onEdit && (
            <Button variant="outline" onClick={onEdit}>
              Edit YAML
            </Button>
          )}
          <Button variant="ghost" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy YAML'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
