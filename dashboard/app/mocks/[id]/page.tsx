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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import type { MockEndpoint, MockServerStatus, ResponseConfig, MatchConfig } from '@/lib/api/types';
import { useRouter } from 'next/navigation';

type PageParams = Promise<{ id: string }>;

const METHOD_COLORS: Record<string, string> = {
  GET:     'bg-blue-400/10 text-blue-400',
  POST:    'bg-teal-400/10 text-teal-400',
  PUT:     'bg-yellow-400/10 text-yellow-400',
  PATCH:   'bg-orange-400/10 text-orange-400',
  DELETE:  'bg-red-400/10 text-red-400',
  HEAD:    'bg-[#1a2d3d] text-[#4a7a96]',
  OPTIONS: 'bg-[#1a2d3d] text-[#4a7a96]',
};

const STATUS_COLORS: Record<MockServerStatus, string> = {
  running:  'bg-teal-400',
  starting: 'bg-yellow-400',
  stopped:  'bg-[#3d5670]',
  failed:   'bg-red-400',
};
const STATUS_TEXT: Record<MockServerStatus, string> = {
  running:  'text-teal-400',
  starting: 'text-yellow-400',
  stopped:  'text-[#4a6480]',
  failed:   'text-red-400',
};

function MethodBadge({ method }: { method: string }) {
  const upper = method.toUpperCase();
  return (
    <span className={cn('text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded', METHOD_COLORS[upper] ?? 'bg-[#1a2d3d] text-[#4a6480]')}>
      {upper}
    </span>
  );
}

function StatusCodeText({ code }: { code: number }) {
  const cls = code < 300 ? 'text-teal-400' : code < 400 ? 'text-yellow-400' : 'text-red-400';
  return <span className={cn('text-[11px] font-medium tabular-nums', cls)}>{code}</span>;
}

// ── Endpoint Form ─────────────────────────────────────────────────────────────

interface EndpointFormData {
  method: string;
  path: string;
  priority: number;
  status_code: number;
  body_type: 'json' | 'text' | 'none';
  body_json: string;
  body_text: string;
  response_headers: Array<{ key: string; value: string }>;
  delay_ms: number;
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

  return { mock_server_id: serverId, method: form.method, path: form.path, priority: form.priority, response_config, match_config };
}

function KVEditor({
  pairs, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value',
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
          <Input placeholder={keyPlaceholder} value={pair.key} onChange={(e) => update(i, 'key', e.target.value)} className="flex-1" />
          <Input placeholder={valuePlaceholder} value={pair.value} onChange={(e) => update(i, 'value', e.target.value)} className="flex-1" />
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

function TemplateHint() {
  return (
    <div className="rounded-lg border border-dashed border-[#1e2d3d] px-3 py-2 text-xs text-[#4a6480] space-y-1">
      <p className="font-medium text-[#7fa8c8]">Template variables</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
        <span><span className="text-blue-400">{'{{.path.id}}'}</span> — path param</span>
        <span><span className="text-blue-400">{'{{.query.page}}'}</span> — query param</span>
        <span><span className="text-blue-400">{'{{.headers.Authorization}}'}</span> — request header</span>
        <span><span className="text-blue-400">{'{{.body.field}}'}</span> — JSON body field</span>
      </div>
    </div>
  );
}

function EndpointDialog({ open, onClose, serverId, endpoint }: {
  open: boolean; onClose: () => void; serverId: string; endpoint?: MockEndpoint;
}) {
  const [form, setForm] = useState<EndpointFormData>(DEFAULT_FORM);
  const [activeSection, setActiveSection] = useState<'response' | 'match' | 'advanced'>('response');

  useEffect(() => {
    if (open) { setForm(endpoint ? endpointToForm(endpoint) : DEFAULT_FORM); setActiveSection('response'); }
  }, [open, endpoint]);

  const createEndpoint = useCreateMockEndpoint();
  const updateEndpoint = useUpdateMockEndpoint();
  const isEditing = !!endpoint;
  const isPending = createEndpoint.isPending || updateEndpoint.isPending;
  const set = <K extends keyof EndpointFormData>(key: K, value: EndpointFormData[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    const data = formToEndpoint(form, serverId);
    if (isEditing) {
      updateEndpoint.mutate({ serverId, endpointId: endpoint.id, endpoint: data }, { onSuccess: onClose });
    } else {
      createEndpoint.mutate({ serverId, endpoint: data }, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Endpoint' : 'Add Endpoint'}</DialogTitle>
          <DialogDescription>Configure the endpoint path, method, and what it should return.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="flex gap-3">
            <div className="w-32">
              <Label className="mb-1.5 block">Method</Label>
              <Select value={form.method} onValueChange={(v) => set('method', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="mb-1.5 block">Path</Label>
              <Input placeholder="/api/users/:id" value={form.path} onChange={(e) => set('path', e.target.value)} />
            </div>
            <div className="w-24">
              <Label className="mb-1.5 block">Priority</Label>
              <Input type="number" min={0} value={form.priority} onChange={(e) => set('priority', parseInt(e.target.value) || 0)} />
            </div>
          </div>

          <div className="flex gap-1 border-b border-[#1e2d3d]">
            {(['response', 'match', 'advanced'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSection(s)}
                className={cn(
                  'px-4 py-2 text-xs capitalize transition-colors',
                  activeSection === s ? 'border-b-2 border-teal-400 text-[#c8dce8] font-medium' : 'text-[#4a6480] hover:text-[#7fa8c8]'
                )}
              >
                {s === 'response' ? 'Response' : s === 'match' ? 'Match Rules' : 'Advanced'}
              </button>
            ))}
          </div>

          {activeSection === 'response' && (
            <div className="space-y-4">
              <div className="flex gap-3 items-end">
                <div className="w-32">
                  <Label className="mb-1.5 block">Status Code</Label>
                  <Input type="number" min={100} max={599} value={form.status_code} onChange={(e) => set('status_code', parseInt(e.target.value) || 200)} />
                </div>
                <div className="w-32">
                  <Label className="mb-1.5 block">Delay (ms)</Label>
                  <Input type="number" min={0} value={form.delay_ms} onChange={(e) => set('delay_ms', parseInt(e.target.value) || 0)} />
                </div>
                <div className="flex-1">
                  <Label className="mb-1.5 block">Body Type</Label>
                  <Select value={form.body_type} onValueChange={(v: any) => set('body_type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Textarea value={form.body_json} onChange={(e) => set('body_json', e.target.value)} className="font-mono text-sm h-40" placeholder='{"id": "{{.path.id}}", "success": true}' />
                  <TemplateHint />
                </div>
              )}
              {form.body_type === 'text' && (
                <div className="space-y-2">
                  <Label className="block">Response Body (Text)</Label>
                  <Textarea value={form.body_text} onChange={(e) => set('body_text', e.target.value)} className="font-mono text-sm h-32" placeholder="Hello {{.path.name}}!" />
                  <TemplateHint />
                </div>
              )}
              <div>
                <Label className="mb-2 block">Response Headers</Label>
                <KVEditor pairs={form.response_headers} onChange={(pairs) => set('response_headers', pairs)} keyPlaceholder="Header name" valuePlaceholder="Value" />
              </div>
            </div>
          )}

          {activeSection === 'match' && (
            <div className="space-y-4">
              <p className="text-xs text-[#4a6480]">Define rules that a request must satisfy to match this endpoint. Leave empty to match all requests to this path/method.</p>
              <div>
                <Label className="mb-1.5 block">Path Pattern (regex)</Label>
                <Input placeholder="e.g. /api/users/\d+" value={form.path_pattern} onChange={(e) => set('path_pattern', e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5 block">Body Pattern (regex)</Label>
                <Input placeholder='"type":"order"' value={form.body_pattern} onChange={(e) => set('body_pattern', e.target.value)} />
              </div>
              <div>
                <Label className="mb-2 block">Required Headers</Label>
                <KVEditor pairs={form.match_headers} onChange={(pairs) => set('match_headers', pairs)} keyPlaceholder="Header name" valuePlaceholder="Expected value" />
              </div>
              <div>
                <Label className="mb-2 block">Required Query Params</Label>
                <KVEditor pairs={form.match_query_params} onChange={(pairs) => set('match_query_params', pairs)} keyPlaceholder="Param name" valuePlaceholder="Expected value" />
              </div>
            </div>
          )}

          {activeSection === 'advanced' && (
            <div className="space-y-4">
              <p className="text-xs text-[#4a6480]">Higher priority endpoints are matched first when multiple endpoints could match the same request.</p>
              <div className="w-40">
                <Label className="mb-1.5 block">Priority</Label>
                <Input type="number" min={0} value={form.priority} onChange={(e) => set('priority', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Endpoint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StateDialog({ open, onClose, serverId, stateKey, initialValue }: {
  open: boolean; onClose: () => void; serverId: string; stateKey?: string; initialValue?: Record<string, any>;
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
        updateState.mutate({ serverId, key: stateKey!, data: { state_value: parsed } }, { onSuccess: onClose });
      } else {
        createState.mutate({ serverId, data: { state_key: key, state_value: parsed } }, { onSuccess: onClose });
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
              <Input placeholder="e.g. user_count" value={key} onChange={(e) => setKey(e.target.value)} />
            </div>
          )}
          <div>
            <Label className="mb-1.5 block">Value (JSON)</Label>
            <Textarea className="font-mono text-sm h-32" value={value} onChange={(e) => { setValue(e.target.value); setError(''); }} placeholder='{"value": 0}' />
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || (!isEditing && !key.trim())}>
            {isPending ? 'Saving…' : isEditing ? 'Save' : 'Add'}
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

  if (serverError) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-6 text-red-400 text-sm">
          {serverError instanceof Error ? serverError.message : 'Failed to load mock server'}
        </div>
      </div>
    );
  }

  if (serverLoading || !server) {
    return (
      <div className="px-6 py-6">
        <div className="h-8 w-48 rounded bg-[#1a2d3d] animate-pulse mb-6" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-[#0f1923] border border-[#1e2d3d] animate-pulse" />)}
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'endpoints' as const, label: 'Endpoints', count: endpoints.length },
    { id: 'requests' as const, label: 'Request Log', count: requestsData?.total },
    { id: 'state' as const, label: 'State', count: states.length },
  ];

  return (
    <div className="px-6 py-6 flex flex-col gap-5">
      {/* Back link */}
      <div>
        <Link href="/mocks" className="inline-flex items-center gap-1.5 text-[11px] text-[#4a6480] hover:text-[#7fa8c8] transition-colors mb-4">
          <ArrowLeft className="w-3 h-3" />
          Back to Mock Servers
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-semibold text-[#c8dce8]">{server.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <code className="text-[11px] font-mono text-[#4a6480] bg-[#0b0f18] border border-[#1a2332] px-2 py-0.5 rounded">
                {server.base_url}
              </code>
              <button onClick={handleCopyUrl} className="text-[#3d5670] hover:text-teal-400 transition-colors" title="Copy base URL">
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', STATUS_TEXT[server.status])}>
              <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_COLORS[server.status])} />
              {server.status.charAt(0).toUpperCase() + server.status.slice(1)}
            </span>

            {server.status === 'running' && (
              <button
                onClick={() => stopServer.mutate(serverId)}
                disabled={stopServer.isPending}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-50 transition-colors"
              >
                <Square className="w-3 h-3" />
                Stop
              </button>
            )}
            {(server.status === 'stopped' || server.status === 'failed') && (
              <button
                onClick={() => startServer.mutate(serverId)}
                disabled={startServer.isPending}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-50 transition-colors"
              >
                <Play className="w-3 h-3" />
                Start
              </button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-red-400 bg-[#0f1923] border border-[#1e2d3d] hover:border-red-400/30 hover:bg-red-400/5 transition-colors">
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Mock Server?</AlertDialogTitle>
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
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Endpoints', value: endpoints.length, sub: 'Configured endpoints' },
          { label: 'Requests', value: requestsData?.total ?? requests.length, sub: 'Total requests received' },
          { label: 'Active since', value: server.started_at ? formatDistanceToNow(new Date(server.started_at)) : '—', sub: 'Since last start' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="flex flex-col gap-2 p-4 rounded-xl bg-[#0f1923] border border-[#1e2d3d]">
            <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{label}</span>
            <p className="text-2xl font-bold leading-none text-[#c8dce8] tabular-nums">{value}</p>
            <p className="text-[11px] text-[#4a6480]">{sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        {/* Tab header */}
        <div className="flex border-b border-[#1a2332] px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-3 text-xs transition-colors border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-teal-400 text-[#c8dce8] font-medium'
                  : 'border-transparent text-[#4a6480] hover:text-[#7fa8c8]'
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="text-[10px] bg-[#1a2d3d] text-[#4a6480] rounded-full px-1.5 py-0.5">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ── Endpoints Tab ── */}
          {activeTab === 'endpoints' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-[11px] text-[#4a6480]">
                  Endpoints are matched in priority order (highest first).
                </p>
                <button
                  onClick={() => setEndpointDialog({ open: true })}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Endpoint
                </button>
              </div>

              {endpoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Activity className="w-10 h-10 mb-3 text-[#1e2d3d]" />
                  <p className="text-sm text-[#3d5670]">No endpoints configured</p>
                  <p className="text-[11px] text-[#2a3d52] mt-1">Add an endpoint to start serving mock responses</p>
                </div>
              ) : (
                <div className="rounded-lg border border-[#1a2332] overflow-hidden">
                  <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-3 py-2 border-b border-[#1a2332]">
                    {['Method', 'Path', 'Status', 'Body', 'Priority', ''].map((h) => (
                      <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
                    ))}
                  </div>
                  <div className="divide-y divide-[#1a2332]">
                    {endpoints.map((ep) => (
                      <div key={ep.id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-3 py-2.5 items-center hover:bg-[#131b26] transition-colors group">
                        <MethodBadge method={ep.method} />
                        <code className="text-[11px] font-mono text-[#c8dce8]">{ep.path}</code>
                        <StatusCodeText code={ep.response_config.status_code} />
                        <span className="text-[11px] text-[#4a6480]">
                          {ep.response_config.body_json ? 'JSON' : ep.response_config.body_text ? 'Text' : ep.response_config.body ? 'Body' : 'Empty'}
                          {ep.response_config.delay_ms ? ` · ${ep.response_config.delay_ms}ms` : ''}
                        </span>
                        <span className="text-[11px] text-[#7fa8c8] text-center">{ep.priority}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEndpointDialog({ open: true, endpoint: ep })}
                            className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-red-400 hover:bg-red-400/10 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Endpoint?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Delete <code>{ep.method} {ep.path}</code>? This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteEndpoint.mutate({ serverId, endpointId: ep.id })}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Requests Tab ── */}
          {activeTab === 'requests' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex gap-1">
                  {(['all', 'matched', 'unmatched'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setRequestFilter(f)}
                      className={cn(
                        'h-7 px-3 rounded-lg text-xs capitalize transition-colors',
                        requestFilter === f
                          ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                          : 'text-[#4a6480] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => clearRequests.mutate(serverId)}
                  disabled={clearRequests.isPending || requests.length === 0}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-40 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Clear Logs
                </button>
              </div>

              {requests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="w-10 h-10 mb-3 text-[#1e2d3d]" />
                  <p className="text-sm text-[#3d5670]">No requests received yet</p>
                  <p className="text-[11px] text-[#2a3d52] mt-1">Logs update automatically every 3 seconds</p>
                </div>
              ) : (
                <div className="rounded-lg border border-[#1a2332] overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-4 px-3 py-2 border-b border-[#1a2332]">
                    {['Time', 'Method', 'Path', 'Status', 'Matched'].map((h) => (
                      <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
                    ))}
                  </div>
                  <div className="divide-y divide-[#1a2332]">
                    {requests.map((req) => (
                      <div key={req.id} className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-4 px-3 py-2.5 items-center hover:bg-[#131b26] transition-colors">
                        <span className="text-[11px] text-[#4a6480] whitespace-nowrap">
                          {formatDistanceToNow(new Date(req.received_at), { addSuffix: true })}
                        </span>
                        <MethodBadge method={req.method} />
                        <code className="text-[11px] font-mono text-[#c8dce8]">{req.path}</code>
                        <StatusCodeText code={req.response_code} />
                        <span className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded',
                          req.matched ? 'bg-teal-400/10 text-teal-400' : 'bg-[#1a2d3d] text-[#4a6480]'
                        )}>
                          {req.matched ? 'Matched' : 'Unmatched'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── State Tab ── */}
          {activeTab === 'state' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-[11px] text-[#4a6480]">State variables are stored per-server and can be read/mutated by stateful endpoints.</p>
                <button
                  onClick={() => setStateDialog({ open: true })}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Variable
                </button>
              </div>

              {states.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Database className="w-10 h-10 mb-3 text-[#1e2d3d]" />
                  <p className="text-sm text-[#3d5670]">No state variables</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {states.map((state) => (
                    <div key={state.id} className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <Database className="w-3.5 h-3.5 text-[#3d5670]" />
                          <code className="text-[11px] font-medium text-[#c8dce8]">{state.state_key}</code>
                          <span className="text-[10px] text-[#3d5670]">
                            Updated {formatDistanceToNow(new Date(state.updated_at), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setStateDialog({ open: true, stateKey: state.state_key, initialValue: state.state_value })}
                            className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-red-400 hover:bg-red-400/10 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete State Variable?</AlertDialogTitle>
                                <AlertDialogDescription>Delete state variable <code>{state.state_key}</code>?</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteState.mutate({ serverId, key: state.state_key })}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <pre className="text-[11px] font-mono text-[#7fa8c8] bg-[#0f1923] border border-[#1a2332] p-2.5 rounded overflow-auto max-h-40">
                        {JSON.stringify(state.state_value, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
