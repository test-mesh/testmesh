'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  useMockServer,
  useMockServerEndpoints,
  useMockServerRequests,
  useMockServerStates,
  useCreateMockEndpoint,
  useUpdateMockEndpoint,
  useDeleteMockEndpoint,
  useCreateMockState,
  useUpdateMockState,
  useDeleteMockState,
  useClearMockRequests,
  useStartMockServer,
  useStopMockServer,
  useDeleteMockServer,
} from '@/lib/hooks/useMockServers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Server,
  ArrowLeft,
  Clock,
  Database,
  Plus,
  Pencil,
  Trash2,
  Play,
  Square,
  Copy,
  Check,
  X,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { MockEndpoint, MockServerStatus, ResponseConfig, MatchConfig } from '@/lib/api/types';
import { useRouter } from 'next/navigation';

type PageParams = Promise<{ id: string }>;

// HTTP method color map
const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  POST: 'bg-green-500/10 text-green-600 border-green-500/30',
  PUT: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  PATCH: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  DELETE: 'bg-red-500/10 text-red-600 border-red-500/30',
};

// ── Endpoint Form ────────────────────────────────────────────────────────────

interface EndpointFormData {
  method: string;
  path: string;
  priority: number;
  // Response
  status_code: number;
  body_type: 'json' | 'text' | 'none';
  body_json: string;
  body_text: string;
  response_headers: Array<{ key: string; value: string }>;
  delay_ms: number;
  // Match config
  path_pattern: string;
  match_headers: Array<{ key: string; value: string }>;
  match_query_params: Array<{ key: string; value: string }>;
  body_pattern: string;
}

const DEFAULT_FORM: EndpointFormData = {
  method: 'GET',
  path: '/api/example',
  priority: 0,
  status_code: 200,
  body_type: 'json',
  body_json: '{\n  "success": true\n}',
  body_text: '',
  response_headers: [],
  delay_ms: 0,
  path_pattern: '',
  match_headers: [],
  match_query_params: [],
  body_pattern: '',
};

function endpointToForm(endpoint: MockEndpoint): EndpointFormData {
  const rc = endpoint.response_config;
  let body_type: 'json' | 'text' | 'none' = 'none';
  let body_json = '{}';
  let body_text = '';

  if (rc.body_json) {
    body_type = 'json';
    body_json = JSON.stringify(rc.body_json, null, 2);
  } else if (rc.body_text) {
    body_type = 'text';
    body_text = rc.body_text;
  } else if (rc.body) {
    body_type = 'json';
    body_json = JSON.stringify(rc.body, null, 2);
  }

  return {
    method: endpoint.method,
    path: endpoint.path,
    priority: endpoint.priority,
    status_code: rc.status_code,
    body_type,
    body_json,
    body_text,
    response_headers: Object.entries(rc.headers || {}).map(([k, v]) => ({ key: k, value: v })),
    delay_ms: rc.delay_ms || 0,
    path_pattern: endpoint.match_config?.path_pattern || '',
    match_headers: Object.entries(endpoint.match_config?.headers || {}).map(([k, v]) => ({ key: k, value: v })),
    match_query_params: Object.entries(endpoint.match_config?.query_params || {}).map(([k, v]) => ({ key: k, value: v })),
    body_pattern: endpoint.match_config?.body_pattern || '',
  };
}

function formToEndpoint(form: EndpointFormData, serverId: string): Partial<MockEndpoint> {
  const response_config: ResponseConfig = {
    status_code: form.status_code,
    delay_ms: form.delay_ms || undefined,
    headers: form.response_headers.reduce((acc, { key, value }) => {
      if (key) acc[key] = value;
      return acc;
    }, {} as Record<string, string>),
  };

  if (form.body_type === 'json' && form.body_json.trim()) {
    try {
      response_config.body_json = JSON.parse(form.body_json);
    } catch {
      response_config.body_text = form.body_json;
    }
  } else if (form.body_type === 'text' && form.body_text) {
    response_config.body_text = form.body_text;
  }

  const match_config: MatchConfig = {};
  if (form.path_pattern) match_config.path_pattern = form.path_pattern;
  if (form.body_pattern) match_config.body_pattern = form.body_pattern;
  if (form.match_headers.length > 0) {
    match_config.headers = form.match_headers.reduce((acc, { key, value }) => {
      if (key) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
  }
  if (form.match_query_params.length > 0) {
    match_config.query_params = form.match_query_params.reduce((acc, { key, value }) => {
      if (key) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
  }

  return {
    mock_server_id: serverId,
    method: form.method,
    path: form.path,
    priority: form.priority,
    response_config,
    match_config,
  };
}

// ── KV Editor ────────────────────────────────────────────────────────────────

function KVEditor({
  pairs,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}: {
  pairs: Array<{ key: string; value: string }>;
  onChange: (pairs: Array<{ key: string; value: string }>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const add = () => onChange([...pairs, { key: '', value: '' }]);
  const remove = (i: number) => onChange(pairs.filter((_, idx) => idx !== i));
  const update = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...pairs];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {pairs.map((pair, i) => (
        <div key={i} className="flex gap-2">
          <Input
            placeholder={keyPlaceholder}
            value={pair.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder={valuePlaceholder}
            value={pair.value}
            onChange={(e) => update(i, 'value', e.target.value)}
            className="flex-1"
          />
          <Button variant="ghost" size="icon" onClick={() => remove(i)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} type="button">
        <Plus className="w-3 h-3 mr-1" /> Add
      </Button>
    </div>
  );
}

// ── TemplateHint ──────────────────────────────────────────────────────────────

function TemplateHint() {
  return (
    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground space-y-1">
      <p className="font-medium text-foreground">Template variables</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
        <span><span className="text-blue-500">{'{{.path.id}}'}</span> — path param</span>
        <span><span className="text-blue-500">{'{{.query.page}}'}</span> — query param</span>
        <span><span className="text-blue-500">{'{{.headers.Authorization}}'}</span> — request header</span>
        <span><span className="text-blue-500">{'{{.body.field}}'}</span> — JSON body field</span>
      </div>
    </div>
  );
}

// ── EndpointDialog ────────────────────────────────────────────────────────────

function EndpointDialog({
  open,
  onClose,
  serverId,
  endpoint,
}: {
  open: boolean;
  onClose: () => void;
  serverId: string;
  endpoint?: MockEndpoint;
}) {
  const [form, setForm] = useState<EndpointFormData>(DEFAULT_FORM);
  const [activeSection, setActiveSection] = useState<'response' | 'match' | 'advanced'>('response');

  useEffect(() => {
    if (open) {
      setForm(endpoint ? endpointToForm(endpoint) : DEFAULT_FORM);
      setActiveSection('response');
    }
  }, [open, endpoint]);

  const createEndpoint = useCreateMockEndpoint();
  const updateEndpoint = useUpdateMockEndpoint();

  const isEditing = !!endpoint;
  const isPending = createEndpoint.isPending || updateEndpoint.isPending;

  const set = <K extends keyof EndpointFormData>(key: K, value: EndpointFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    const data = formToEndpoint(form, serverId);
    if (isEditing) {
      updateEndpoint.mutate(
        { serverId, endpointId: endpoint.id, endpoint: data },
        { onSuccess: onClose }
      );
    } else {
      createEndpoint.mutate(
        { serverId, endpoint: data },
        { onSuccess: onClose }
      );
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Endpoint' : 'Add Endpoint'}</DialogTitle>
          <DialogDescription>
            Configure the endpoint path, method, and what it should return.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Method + Path */}
          <div className="flex gap-3">
            <div className="w-32">
              <Label className="mb-1.5 block">Method</Label>
              <Select value={form.method} onValueChange={(v) => set('method', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="mb-1.5 block">Path</Label>
              <Input
                placeholder="/api/users/:id"
                value={form.path}
                onChange={(e) => set('path', e.target.value)}
              />
            </div>
            <div className="w-24">
              <Label className="mb-1.5 block">Priority</Label>
              <Input
                type="number"
                min={0}
                value={form.priority}
                onChange={(e) => set('priority', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex gap-1 border-b">
            {(['response', 'match', 'advanced'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSection(s)}
                className={`px-4 py-2 text-sm capitalize ${
                  activeSection === s
                    ? 'border-b-2 border-primary font-medium'
                    : 'text-muted-foreground'
                }`}
              >
                {s === 'response' ? 'Response' : s === 'match' ? 'Match Rules' : 'Advanced'}
              </button>
            ))}
          </div>

          {/* Response Section */}
          {activeSection === 'response' && (
            <div className="space-y-4">
              <div className="flex gap-3 items-end">
                <div className="w-32">
                  <Label className="mb-1.5 block">Status Code</Label>
                  <Input
                    type="number"
                    min={100}
                    max={599}
                    value={form.status_code}
                    onChange={(e) => set('status_code', parseInt(e.target.value) || 200)}
                  />
                </div>
                <div className="w-32">
                  <Label className="mb-1.5 block">Delay (ms)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.delay_ms}
                    onChange={(e) => set('delay_ms', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="flex-1">
                  <Label className="mb-1.5 block">Body Type</Label>
                  <Select value={form.body_type} onValueChange={(v: any) => set('body_type', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="text">Plain Text</SelectItem>
                      <SelectItem value="none">No Body</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.body_type === 'json' && (
                <div className="space-y-2">
                  <Label className="block">Response Body (JSON)</Label>
                  <Textarea
                    value={form.body_json}
                    onChange={(e) => set('body_json', e.target.value)}
                    className="font-mono text-sm h-40"
                    placeholder='{"id": "{{.path.id}}", "success": true}'
                  />
                  <TemplateHint />
                </div>
              )}

              {form.body_type === 'text' && (
                <div className="space-y-2">
                  <Label className="block">Response Body (Text)</Label>
                  <Textarea
                    value={form.body_text}
                    onChange={(e) => set('body_text', e.target.value)}
                    className="font-mono text-sm h-32"
                    placeholder="Hello {{.path.name}}!"
                  />
                  <TemplateHint />
                </div>
              )}

              <div>
                <Label className="mb-2 block">Response Headers</Label>
                <KVEditor
                  pairs={form.response_headers}
                  onChange={(pairs) => set('response_headers', pairs)}
                  keyPlaceholder="Header name"
                  valuePlaceholder="Value"
                />
              </div>
            </div>
          )}

          {/* Match Section */}
          {activeSection === 'match' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Define rules that a request must satisfy to match this endpoint. Leave empty to match all requests to this path/method.
              </p>
              <div>
                <Label className="mb-1.5 block">Path Pattern (regex)</Label>
                <Input
                  placeholder="e.g. /api/users/\d+"
                  value={form.path_pattern}
                  onChange={(e) => set('path_pattern', e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Body Pattern (regex)</Label>
                <Input
                  placeholder='e.g. "type":"order"'
                  value={form.body_pattern}
                  onChange={(e) => set('body_pattern', e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-2 block">Required Headers</Label>
                <KVEditor
                  pairs={form.match_headers}
                  onChange={(pairs) => set('match_headers', pairs)}
                  keyPlaceholder="Header name"
                  valuePlaceholder="Expected value"
                />
              </div>
              <div>
                <Label className="mb-2 block">Required Query Params</Label>
                <KVEditor
                  pairs={form.match_query_params}
                  onChange={(pairs) => set('match_query_params', pairs)}
                  keyPlaceholder="Param name"
                  valuePlaceholder="Expected value"
                />
              </div>
            </div>
          )}

          {/* Advanced Section */}
          {activeSection === 'advanced' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Higher priority endpoints are matched first when multiple endpoints could match the same request.
              </p>
              <div className="w-40">
                <Label className="mb-1.5 block">Priority</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.priority}
                  onChange={(e) => set('priority', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Endpoint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── StateDialog ───────────────────────────────────────────────────────────────

function StateDialog({
  open,
  onClose,
  serverId,
  stateKey,
  initialValue,
}: {
  open: boolean;
  onClose: () => void;
  serverId: string;
  stateKey?: string;
  initialValue?: Record<string, any>;
}) {
  const [key, setKey] = useState(stateKey || '');
  const [value, setValue] = useState(initialValue ? JSON.stringify(initialValue, null, 2) : '{}');
  const [error, setError] = useState('');

  const createState = useCreateMockState();
  const updateState = useUpdateMockState();

  const isEditing = !!stateKey;
  const isPending = createState.isPending || updateState.isPending;

  const handleSubmit = () => {
    try {
      const parsed = JSON.parse(value);
      setError('');
      if (isEditing) {
        updateState.mutate(
          { serverId, key: stateKey!, data: { state_value: parsed } },
          { onSuccess: onClose }
        );
      } else {
        createState.mutate(
          { serverId, data: { state_key: key, state_value: parsed } },
          { onSuccess: onClose }
        );
      }
    } catch {
      setError('Invalid JSON');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit State' : 'Add State Variable'}</DialogTitle>
          <DialogDescription>State variables are accessible during request matching and can be mutated by endpoints.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!isEditing && (
            <div>
              <Label className="mb-1.5 block">Key</Label>
              <Input
                placeholder="e.g. user_count"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label className="mb-1.5 block">Value (JSON)</Label>
            <Textarea
              className="font-mono text-sm h-32"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              placeholder='{"value": 0}'
            />
            {error && <p className="text-sm text-destructive mt-1">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || (!isEditing && !key.trim())}>
            {isPending ? 'Saving...' : isEditing ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MockServerDetailPage({ params }: { params: PageParams }) {
  const resolvedParams = use(params);
  const serverId = resolvedParams.id;
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'endpoints' | 'requests' | 'state'>('endpoints');
  const [endpointDialog, setEndpointDialog] = useState<{ open: boolean; endpoint?: MockEndpoint }>({ open: false });
  const [stateDialog, setStateDialog] = useState<{ open: boolean; stateKey?: string; initialValue?: Record<string, any> }>({ open: false });
  const [requestFilter, setRequestFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [copiedUrl, setCopiedUrl] = useState(false);

  const { data: server, isLoading: serverLoading, error: serverError } = useMockServer(serverId);
  const { data: endpointsData } = useMockServerEndpoints(serverId);
  const { data: requestsData } = useMockServerRequests(serverId, {
    matched: requestFilter === 'all' ? undefined : requestFilter === 'matched',
    limit: 100,
  });
  const { data: statesData } = useMockServerStates(serverId);

  const deleteEndpoint = useDeleteMockEndpoint();
  const deleteState = useDeleteMockState();
  const clearRequests = useClearMockRequests();
  const startServer = useStartMockServer();
  const stopServer = useStopMockServer();
  const deleteServer = useDeleteMockServer();

  const endpoints = endpointsData?.endpoints || [];
  const requests = requestsData?.requests || [];
  const states = statesData?.states || [];

  const handleCopyUrl = () => {
    if (!server) return;
    navigator.clipboard.writeText(server.base_url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const getStatusBadge = (status: MockServerStatus) => {
    const colors: Record<string, string> = {
      starting: 'bg-yellow-500',
      running: 'bg-green-500',
      stopped: 'bg-gray-400',
      failed: 'bg-red-500',
    };
    return (
      <Badge variant="secondary" className="capitalize gap-1.5">
        <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
        {status}
      </Badge>
    );
  };

  if (serverError) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Mock Server</CardTitle>
            <CardDescription>
              {serverError instanceof Error ? serverError.message : 'An error occurred'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (serverLoading || !server) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center text-muted-foreground">Loading mock server...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <Link href="/mocks">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Mock Servers
          </Button>
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Server className="w-8 h-8" />
              {server.name}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <code className="text-sm bg-muted px-2 py-1 rounded">{server.base_url}</code>
              <button
                onClick={handleCopyUrl}
                className="text-muted-foreground hover:text-foreground"
                title="Copy base URL"
              >
                {copiedUrl ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {getStatusBadge(server.status)}

            {server.status === 'running' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => stopServer.mutate(serverId)}
                disabled={stopServer.isPending}
              >
                <Square className="w-4 h-4 mr-1.5" />
                Stop
              </Button>
            )}
            {(server.status === 'stopped' || server.status === 'failed') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startServer.mutate(serverId)}
                disabled={startServer.isPending}
              >
                <Play className="w-4 h-4 mr-1.5" />
                Start
              </Button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Mock Server</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the mock server, all its endpoints, and request logs. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteServer.mutate(serverId, { onSuccess: () => router.push('/mocks') })}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{endpoints.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Configured endpoints</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{requestsData?.total ?? requests.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Total requests received</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active since</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {server.started_at ? formatDistanceToNow(new Date(server.started_at)) : '-'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Since last start</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex border-b gap-1">
            {([
              { id: 'endpoints', label: 'Endpoints', count: endpoints.length },
              { id: 'requests', label: 'Request Log', count: requestsData?.total },
              { id: 'state', label: 'State', count: states.length },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className="text-xs bg-muted rounded-full px-1.5 py-0.5">{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {/* ── Endpoints Tab ── */}
          {activeTab === 'endpoints' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Endpoints are matched in priority order (highest first). Within the same priority, more specific match rules win.
                </p>
                <Button size="sm" onClick={() => setEndpointDialog({ open: true })}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Endpoint
                </Button>
              </div>

              {endpoints.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No endpoints configured</p>
                  <p className="text-sm mt-1">Add an endpoint to start serving mock responses</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Method</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-28">Response</TableHead>
                      <TableHead className="w-20 text-center">Priority</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {endpoints.map((ep) => (
                      <TableRow key={ep.id}>
                        <TableCell>
                          <span
                            className={`text-xs font-mono font-semibold px-2 py-1 rounded border ${
                              METHOD_COLORS[ep.method] || 'bg-muted text-muted-foreground border-muted'
                            }`}
                          >
                            {ep.method}
                          </span>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm">{ep.path}</code>
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm font-medium ${
                            ep.response_config.status_code < 300 ? 'text-green-600' :
                            ep.response_config.status_code < 400 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {ep.response_config.status_code}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ep.response_config.body_json
                            ? 'JSON'
                            : ep.response_config.body_text
                            ? 'Text'
                            : ep.response_config.body
                            ? 'Body'
                            : 'Empty'}
                          {ep.response_config.delay_ms ? ` · ${ep.response_config.delay_ms}ms` : ''}
                        </TableCell>
                        <TableCell className="text-center text-sm">{ep.priority}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEndpointDialog({ open: true, endpoint: ep })}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Endpoint</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Delete <code>{ep.method} {ep.path}</code>? This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => deleteEndpoint.mutate({ serverId, endpointId: ep.id })}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {/* ── Requests Tab ── */}
          {activeTab === 'requests' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  {(['all', 'matched', 'unmatched'] as const).map((f) => (
                    <Button
                      key={f}
                      variant={requestFilter === f ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setRequestFilter(f)}
                      className="capitalize"
                    >
                      {f}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearRequests.mutate(serverId)}
                  disabled={clearRequests.isPending || requests.length === 0}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Clear Logs
                </Button>
              </div>

              {requests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No requests received yet</p>
                  <p className="text-sm mt-1">Logs update automatically every 3 seconds</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead className="w-20">Method</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead className="w-20">Status</TableHead>
                      <TableHead className="w-24">Matched</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(req.received_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${
                              METHOD_COLORS[req.method] || 'bg-muted text-muted-foreground border-muted'
                            }`}
                          >
                            {req.method}
                          </span>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm">{req.path}</code>
                        </TableCell>
                        <TableCell className={`text-sm font-medium ${
                          req.response_code < 300 ? 'text-green-600' :
                          req.response_code < 400 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {req.response_code}
                        </TableCell>
                        <TableCell>
                          {req.matched ? (
                            <Badge variant="secondary" className="bg-green-500/10 text-green-700 text-xs">
                              Matched
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Unmatched
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {/* ── State Tab ── */}
          {activeTab === 'state' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  State variables are stored per-server and can be read/mutated by stateful endpoints.
                </p>
                <Button size="sm" onClick={() => setStateDialog({ open: true })}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Variable
                </Button>
              </div>

              {states.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No state variables</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {states.map((state) => (
                    <div key={state.id} className="rounded-lg border p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-muted-foreground" />
                          <code className="text-sm font-medium">{state.state_key}</code>
                          <span className="text-xs text-muted-foreground">
                            Updated {formatDistanceToNow(new Date(state.updated_at), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setStateDialog({ open: true, stateKey: state.state_key, initialValue: state.state_value })}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete State Variable</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Delete state variable <code>{state.state_key}</code>?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteState.mutate({ serverId, key: state.state_key })}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <pre className="text-sm bg-muted p-3 rounded overflow-auto max-h-40">
                        {JSON.stringify(state.state_value, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <EndpointDialog
        open={endpointDialog.open}
        onClose={() => setEndpointDialog({ open: false })}
        serverId={serverId}
        endpoint={endpointDialog.endpoint}
      />
      <StateDialog
        open={stateDialog.open}
        onClose={() => setStateDialog({ open: false })}
        serverId={serverId}
        stateKey={stateDialog.stateKey}
        initialValue={stateDialog.initialValue}
      />
    </div>
  );
}
