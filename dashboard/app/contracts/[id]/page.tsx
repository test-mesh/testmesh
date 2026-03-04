'use client';

import { useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import {
  useContract,
  useContractVerifications,
  useContractBreakingChanges,
  useExportPact,
} from '@/lib/hooks/useContracts';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  FileText,
  ArrowLeft,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Code,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { VerificationStatus, BreakingChangeSeverity } from '@/lib/api/types';

type PageParams = Promise<{ id: string }>;

export default function ContractDetailPage({ params }: { params: PageParams }) {
  const resolvedParams = use(params);
  const contractId = resolvedParams.id;
  const [activeTab, setActiveTab] = useState<'interactions' | 'verifications' | 'breaking-changes'>(
    'interactions'
  );

  const { data: contractData, isLoading, error } = useContract(contractId);
  const { data: verificationsData } = useContractVerifications(contractId);
  const { data: breakingChangesData } = useContractBreakingChanges(contractId);
  const exportPact = useExportPact();

  const handleExport = () => {
    exportPact.mutate(contractId);
  };

  const getVerificationBadge = (status: VerificationStatus) => {
    const variants = {
      pending: { color: 'bg-yellow-500', icon: Clock },
      passed: { color: 'bg-green-500', icon: CheckCircle2 },
      failed: { color: 'bg-red-500', icon: XCircle },
    };

    const config = variants[status];
    const Icon = config.icon;

    return (
      <Badge variant="default" className="capitalize">
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  const getSeverityBadge = (severity: BreakingChangeSeverity) => {
    const variants = {
      critical: 'destructive',
      major: 'default',
      minor: 'secondary',
    };

    return (
      <Badge variant={variants[severity] as any} className="capitalize">
        {severity}
      </Badge>
    );
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Contract</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'An error occurred'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading || !contractData) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center text-muted-foreground">Loading contract...</div>
      </div>
    );
  }

  const { contract, interactions } = contractData;
  const verifications = verificationsData?.verifications || [];
  const breakingChanges = breakingChangesData?.changes || [];

  const criticalChanges = breakingChanges.filter((c) => c.severity === 'critical').length;
  const majorChanges = breakingChanges.filter((c) => c.severity === 'major').length;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Link href="/contracts">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Contracts
          </Button>
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileText className="w-8 h-8" />
              {contract.consumer} → {contract.provider}
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <Badge variant="secondary">{contract.version}</Badge>
              <Badge variant="outline">Pact {contract.pact_version}</Badge>
              <span className="text-sm text-muted-foreground">
                Created {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>
          <Button onClick={handleExport} disabled={exportPact.isPending}>
            <Download className="w-4 h-4 mr-2" />
            Export Pact JSON
          </Button>
        </div>
      </div>

      {criticalChanges > 0 && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical Breaking Changes Detected</AlertTitle>
          <AlertDescription>
            This contract has {criticalChanges} critical and {majorChanges} major breaking changes
            compared to previous versions.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Interactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{interactions.length}</div>
            <p className="text-xs text-muted-foreground mt-1">API interactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Verifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{verifications.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Provider verifications</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Latest Status</CardTitle>
          </CardHeader>
          <CardContent>
            {verifications.length > 0 ? (
              <div className="text-2xl font-bold">
                {getVerificationBadge(verifications[0].status)}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No verifications</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Breaking Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{breakingChanges.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {criticalChanges} critical
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex space-x-4 border-b">
            <button
              onClick={() => setActiveTab('interactions')}
              className={`pb-2 px-1 ${
                activeTab === 'interactions'
                  ? 'border-b-2 border-primary font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              Interactions ({interactions.length})
            </button>
            <button
              onClick={() => setActiveTab('verifications')}
              className={`pb-2 px-1 ${
                activeTab === 'verifications'
                  ? 'border-b-2 border-primary font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              Verifications ({verifications.length})
            </button>
            <button
              onClick={() => setActiveTab('breaking-changes')}
              className={`pb-2 px-1 ${
                activeTab === 'breaking-changes'
                  ? 'border-b-2 border-primary font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              Breaking Changes ({breakingChanges.length})
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === 'interactions' && (
            <div className="space-y-4">
              {interactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No interactions</p>
              ) : (
                interactions.map((interaction) => (
                  <Card key={interaction.id}>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Code className="w-4 h-4" />
                        {interaction.description}
                      </CardTitle>
                      {interaction.provider_state && (
                        <CardDescription>
                          Provider State: {interaction.provider_state}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-medium mb-2">Request</h4>
                          <div className="space-y-1 text-sm">
                            <div>
                              <Badge variant="outline">{interaction.request.method}</Badge>{' '}
                              <code>{interaction.request.path}</code>
                            </div>
                            {interaction.request.body && (
                              <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto">
                                {JSON.stringify(interaction.request.body, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-2">Response</h4>
                          <div className="space-y-1 text-sm">
                            <div>
                              Status: <Badge variant="outline">{interaction.response.status}</Badge>
                            </div>
                            {interaction.response.body && (
                              <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto">
                                {JSON.stringify(interaction.response.body, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {activeTab === 'verifications' && (
            <div>
              {verifications.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No verifications yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider Version</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Passed</TableHead>
                      <TableHead>Failed</TableHead>
                      <TableHead>Verified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {verifications.map((verification) => (
                      <TableRow key={verification.id}>
                        <TableCell>
                          <code className="text-sm">{verification.provider_version}</code>
                        </TableCell>
                        <TableCell>{getVerificationBadge(verification.status)}</TableCell>
                        <TableCell className="text-green-600 font-medium">
                          {verification.results.passed_interactions}
                        </TableCell>
                        <TableCell className="text-red-600 font-medium">
                          {verification.results.failed_interactions}
                        </TableCell>
                        <TableCell>
                          {formatDistanceToNow(new Date(verification.verified_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {activeTab === 'breaking-changes' && (
            <div>
              {breakingChanges.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No breaking changes detected</p>
              ) : (
                <div className="space-y-3">
                  {breakingChanges.map((change) => (
                    <Alert
                      key={change.id}
                      variant={change.severity === 'critical' ? 'destructive' : 'default'}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {getSeverityBadge(change.severity)}
                            <Badge variant="outline">{change.change_type}</Badge>
                          </div>
                          <AlertTitle className="mt-2">{change.description}</AlertTitle>
                          <AlertDescription className="mt-1">
                            <strong>Impact:</strong> {change.details.impact}
                            {change.details.suggestion && (
                              <>
                                <br />
                                <strong>Suggestion:</strong> {change.details.suggestion}
                              </>
                            )}
                          </AlertDescription>
                          <div className="text-xs text-muted-foreground mt-2">
                            Detected{' '}
                            {formatDistanceToNow(new Date(change.detected_at), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                    </Alert>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
