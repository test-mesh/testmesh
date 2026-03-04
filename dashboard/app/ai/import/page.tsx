'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useImportOpenAPI, useImportPostman, useImportPact } from '@/lib/hooks/useAI';
import { ArrowLeft, FileUp, Loader2, Check, FileCode } from 'lucide-react';
import type { ImportResponse } from '@/lib/api/types';

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState('openapi');
  const [spec, setSpec] = useState('');
  const [createFlows, setCreateFlows] = useState(true);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const importOpenAPI = useImportOpenAPI();
  const importPostman = useImportPostman();
  const importPact = useImportPact();

  const isLoading =
    importOpenAPI.isPending || importPostman.isPending || importPact.isPending;

  const handleImport = async () => {
    try {
      let response: ImportResponse;

      switch (activeTab) {
        case 'openapi':
          response = await importOpenAPI.mutateAsync({
            spec,
            create_flows: createFlows,
          });
          break;
        case 'postman':
          response = await importPostman.mutateAsync({
            collection: spec,
            create_flows: createFlows,
          });
          break;
        case 'pact':
          response = await importPact.mutateAsync({
            contract: spec,
            create_flows: createFlows,
          });
          break;
        default:
          throw new Error('Invalid import type');
      }

      setResult(response);
    } catch (error) {
      console.error('Import failed:', error);
    }
  };

  const handleReset = () => {
    setResult(null);
    setSpec('');
  };

  const getPlaceholder = () => {
    switch (activeTab) {
      case 'openapi':
        return 'Paste your OpenAPI/Swagger specification (JSON or YAML)...';
      case 'postman':
        return 'Paste your Postman collection JSON...';
      case 'pact':
        return 'Paste your Pact contract JSON...';
      default:
        return '';
    }
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
            <FileUp className="h-8 w-8" />
            Import & Convert
          </h1>
          <p className="text-muted-foreground mt-1">
            Convert API specifications into test flows
          </p>
        </div>
      </div>

      {!result ? (
        <Card>
          <CardHeader>
            <CardTitle>Select Import Source</CardTitle>
            <CardDescription>
              Choose the type of specification you want to import
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="openapi">OpenAPI / Swagger</TabsTrigger>
                <TabsTrigger value="postman">Postman Collection</TabsTrigger>
                <TabsTrigger value="pact">Pact Contract</TabsTrigger>
              </TabsList>

              <TabsContent value="openapi" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Import OpenAPI 3.0 or Swagger 2.0 specifications to generate comprehensive
                  test flows for each endpoint.
                </p>
              </TabsContent>

              <TabsContent value="postman" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Import Postman collections to convert your existing API requests into
                  automated test flows.
                </p>
              </TabsContent>

              <TabsContent value="pact" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Import Pact contract files to generate consumer-driven contract tests.
                </p>
              </TabsContent>
            </Tabs>

            <div className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label htmlFor="spec">Specification Content</Label>
                <Textarea
                  id="spec"
                  placeholder={getPlaceholder()}
                  value={spec}
                  onChange={(e) => setSpec(e.target.value)}
                  className="min-h-64 font-mono text-sm"
                  disabled={isLoading}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="createFlows"
                  checked={createFlows}
                  onCheckedChange={(checked) => setCreateFlows(checked as boolean)}
                />
                <Label htmlFor="createFlows" className="text-sm">
                  Automatically create flows in the database
                </Label>
              </div>

              <Button
                onClick={handleImport}
                disabled={!spec.trim() || isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <FileUp className="h-4 w-4 mr-2" />
                    Import & Generate Flows
                  </>
                )}
              </Button>

              {(importOpenAPI.isError || importPostman.isError || importPact.isError) && (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg">
                  <p className="font-medium">Import failed</p>
                  <p className="text-sm mt-1">
                    {(() => {
                      const error =
                        importOpenAPI.error || importPostman.error || importPact.error;
                      return error instanceof Error
                        ? error.message
                        : 'An unknown error occurred';
                    })()}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Button variant="outline" onClick={handleReset}>
            <FileUp className="h-4 w-4 mr-2" />
            Import Another
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                Import Successful
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-lg py-1 px-3">
                  {result.flows_generated} flows generated
                </Badge>
              </div>

              {result.flows && result.flows.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">Generated Flows</h3>
                  <div className="grid gap-2">
                    {result.flows.map((flow) => (
                      <Link
                        key={flow.id}
                        href={`/flows/${flow.id}`}
                        className="flex items-center gap-3 p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                      >
                        <FileCode className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium">{flow.name}</div>
                          {flow.description && (
                            <div className="text-sm text-muted-foreground">
                              {flow.description}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary">{flow.definition.steps?.length || 0} steps</Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Link href="/flows">
                  <Button>View All Flows</Button>
                </Link>
                <Button variant="outline" onClick={handleReset}>
                  Import More
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
