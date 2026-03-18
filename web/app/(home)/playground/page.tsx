'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Example {
  id: string;
  title: string;
  description: string;
  yaml: string;
  output: OutputStep[];
}

interface OutputStep {
  id: string;
  action: string;
  status: 'pass' | 'fail' | 'running';
  duration: string;
  detail: string;
}

const EXAMPLES: Example[] = [
  {
    id: 'health-check',
    title: 'Health Check',
    description: 'Simple HTTP request with status assertion',
    yaml: `flow:
  name: "Health Check"
  steps:
    - id: check_api
      action: http_request
      config:
        method: GET
        url: "https://api.example.com/health"
      assert:
        - status == 200
        - body.status == "ok"`,
    output: [
      { id: 'check_api', action: 'http_request', status: 'pass', duration: '142ms', detail: 'GET https://api.example.com/health → 200 OK' },
    ],
  },
  {
    id: 'user-lifecycle',
    title: 'User Lifecycle',
    description: 'Create a user, fetch it, then delete it — passing the ID between steps',
    yaml: `flow:
  name: "User Lifecycle"
  steps:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "https://api.example.com/users"
        body:
          name: "Alice"
          email: "alice@example.com"
      assert:
        - status == 201
        - body.id != ""
      output:
        user_id: $.body.id

    - id: get_user
      action: http_request
      config:
        method: GET
        url: "https://api.example.com/users/{{user_id}}"
      assert:
        - status == 200
        - body.name == "Alice"

    - id: delete_user
      action: http_request
      config:
        method: DELETE
        url: "https://api.example.com/users/{{user_id}}"
      assert:
        - status == 204`,
    output: [
      { id: 'create_user', action: 'http_request', status: 'pass', duration: '186ms', detail: 'POST /users → 201 Created  user_id = "usr_4f8a2b"' },
      { id: 'get_user', action: 'http_request', status: 'pass', duration: '94ms', detail: 'GET /users/usr_4f8a2b → 200 OK  body.name = "Alice" ✓' },
      { id: 'delete_user', action: 'http_request', status: 'pass', duration: '78ms', detail: 'DELETE /users/usr_4f8a2b → 204 No Content' },
    ],
  },
  {
    id: 'order-lifecycle',
    title: 'Order + Kafka',
    description: 'Place an order via HTTP, then consume the Kafka event it produces',
    yaml: `flow:
  name: "Order + Kafka Event"
  steps:
    - id: place_order
      action: http_request
      config:
        method: POST
        url: "https://api.example.com/orders"
        body:
          user_id: "usr-123"
          product_id: "prod-456"
          quantity: 2
      assert:
        - status == 201
        - body.total > 0
      output:
        order_id: $.body.id

    - id: consume_event
      action: kafka_consumer
      config:
        brokers: ["kafka:9092"]
        topic: "order-events"
        group_id: "test-group"
        timeout: 10s
      assert:
        - len(messages) > 0
        - messages[0].value.order_id == "{{order_id}}"
        - messages[0].value.status == "placed"

    - id: verify_db
      action: database_query
      config:
        connection_string: "postgres://user:pass@db:5432/orders"
        query: "SELECT status FROM orders WHERE id = $1"
        params: ["{{order_id}}"]
      assert:
        - rows[0].status == "confirmed"`,
    output: [
      { id: 'place_order', action: 'http_request', status: 'pass', duration: '203ms', detail: 'POST /orders → 201 Created  order_id = "ord_9c3d1e"  total = 49.98' },
      { id: 'consume_event', action: 'kafka_consumer', status: 'pass', duration: '2.1s', detail: 'topic: order-events  1 message received  order_id = "ord_9c3d1e" ✓  status = "placed" ✓' },
      { id: 'verify_db', action: 'database_query', status: 'pass', duration: '31ms', detail: 'SELECT status FROM orders WHERE id = "ord_9c3d1e"  rows[0].status = "confirmed" ✓' },
    ],
  },
];

function StatusBadge({ status }: { status: OutputStep['status'] }) {
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
        ✓ PASS
      </span>
    );
  }
  if (status === 'fail') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
        ✗ FAIL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
      ◎ RUNNING
    </span>
  );
}

export default function PlaygroundPage() {
  const [selectedId, setSelectedId] = useState<string>('user-lifecycle');
  const [ran, setRan] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [visibleSteps, setVisibleSteps] = useState<number>(0);

  const selected = EXAMPLES.find((e) => e.id === selectedId)!;

  const handleRun = () => {
    if (running) return;
    setRan(false);
    setRunning(true);
    setVisibleSteps(0);

    const steps = selected.output;
    let i = 0;
    const reveal = () => {
      if (i < steps.length) {
        i++;
        setVisibleSteps(i);
        const delay = 400 + Math.random() * 600;
        setTimeout(reveal, delay);
      } else {
        setRunning(false);
        setRan(true);
      }
    };
    setTimeout(reveal, 300);
  };

  const handleSelectExample = (id: string) => {
    setSelectedId(id);
    setRan(false);
    setRunning(false);
    setVisibleSteps(0);
  };

  const totalDuration = selected.output
    .slice(0, visibleSteps)
    .reduce((sum, s) => {
      const n = parseFloat(s.duration);
      const unit = s.duration.includes('ms') ? 1 : 1000;
      return sum + n * unit;
    }, 0);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b px-4 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold">Interactive Playground</h1>
              <p className="text-fd-muted-foreground mt-1">
                Explore TestMesh flow examples. Select a scenario, read the YAML, then simulate execution.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/docs/getting-started/first-flow"
                className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-fd-accent transition-colors"
              >
                Write your own →
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90 transition-colors"
              >
                Read the docs
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Example selector */}
        <div className="flex gap-3 mb-6 flex-wrap">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              onClick={() => handleSelectExample(ex.id)}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                selectedId === ex.id
                  ? 'border-fd-primary bg-fd-primary/10'
                  : 'hover:bg-fd-accent'
              }`}
            >
              <div className="font-medium text-sm">{ex.title}</div>
              <div className="text-xs text-fd-muted-foreground mt-0.5">{ex.description}</div>
            </button>
          ))}
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* YAML panel */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-fd-muted-foreground uppercase tracking-wide">Flow YAML</h2>
              <span className="text-xs text-fd-muted-foreground">{selected.yaml.split('\n').length} lines</span>
            </div>
            <div className="rounded-lg border bg-fd-card overflow-hidden flex-1">
              <div className="border-b px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-mono text-fd-muted-foreground">flow.yaml</span>
                <button
                  onClick={() => navigator.clipboard?.writeText(selected.yaml)}
                  className="text-xs text-fd-muted-foreground hover:text-fd-foreground transition-colors"
                >
                  Copy
                </button>
              </div>
              <pre className="p-4 text-sm overflow-x-auto leading-relaxed font-mono">
                <code>{selected.yaml}</code>
              </pre>
            </div>
          </div>

          {/* Execution panel */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-fd-muted-foreground uppercase tracking-wide">Execution Output</h2>
              <button
                onClick={handleRun}
                disabled={running}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  running
                    ? 'bg-fd-muted text-fd-muted-foreground cursor-not-allowed'
                    : 'bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90'
                }`}
              >
                {running ? '⏳ Running...' : ran ? '▶ Run again' : '▶ Run flow'}
              </button>
            </div>

            <div className="rounded-lg border bg-fd-card overflow-hidden min-h-64">
              <div className="border-b px-4 py-2">
                <span className="text-sm font-mono text-fd-muted-foreground">terminal</span>
              </div>

              <div className="p-4 font-mono text-sm space-y-3">
                {!ran && !running && visibleSteps === 0 && (
                  <p className="text-fd-muted-foreground text-sm">
                    Click <strong>Run flow</strong> to simulate execution.
                  </p>
                )}

                {(running || ran) && (
                  <>
                    <div className="text-fd-muted-foreground text-xs mb-2">
                      $ testmesh run flow.yaml
                    </div>
                    {selected.output.slice(0, visibleSteps).map((step) => (
                      <div key={step.id} className="flex flex-col gap-1 pb-3 border-b last:border-b-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <StatusBadge status={step.status} />
                          <span className="font-medium">{step.id}</span>
                          <span className="text-fd-muted-foreground text-xs ml-auto">{step.duration}</span>
                        </div>
                        <div className="text-xs text-fd-muted-foreground pl-1 leading-relaxed">
                          {step.detail}
                        </div>
                      </div>
                    ))}

                    {running && visibleSteps < selected.output.length && (
                      <div className="flex items-center gap-3 opacity-60">
                        <StatusBadge status="running" />
                        <span className="font-medium">{selected.output[visibleSteps]?.id}</span>
                      </div>
                    )}

                    {ran && (
                      <div className="pt-2 mt-2 border-t">
                        <div className="text-green-600 dark:text-green-400 font-medium">
                          ✓ All {selected.output.length} steps passed
                        </div>
                        <div className="text-fd-muted-foreground text-xs mt-1">
                          Total: {totalDuration < 1000 ? `${Math.round(totalDuration)}ms` : `${(totalDuration / 1000).toFixed(1)}s`}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom callout */}
        <div className="mt-10 rounded-lg border bg-fd-card p-6 text-center">
          <h3 className="font-semibold mb-2">Ready to write your own flow?</h3>
          <p className="text-fd-muted-foreground text-sm mb-4">
            This playground uses simulated output. Install TestMesh to run real flows against your own services.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center gap-2 rounded-md bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90 transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/docs/cheat-sheet"
              className="inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-medium hover:bg-fd-accent transition-colors"
            >
              YAML Cheat Sheet
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
