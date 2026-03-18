'use client';

import Link from 'next/link';
import { useState } from 'react';

const TABS = ['Install', 'Write', 'Run'] as const;
type Tab = (typeof TABS)[number];

const TAB_CONTENT: Record<Tab, { filename: string; code: string }> = {
  Install: {
    filename: 'terminal',
    code: `# Install CLI
go install github.com/test-mesh/testmesh/cli@latest

# Or with Docker
docker compose up -d`,
  },
  Write: {
    filename: 'order-flow.yaml',
    code: `flow:
  name: "Order Lifecycle"
  steps:
    - id: create_order
      action: http_request
      config:
        method: POST
        url: "{{BASE_URL}}/orders"
        body:
          user_id: "{{user_id}}"
          product_id: "prod-123"
      assert:
        - status == 201
      output:
        order_id: $.body.id

    - id: verify_event
      action: kafka_consumer
      config:
        brokers: ["localhost:9092"]
        topic: "order-events"
        timeout: 10s
      assert:
        - messages[0].value.order_id == "{{order_id}}"

    - id: check_db
      action: database_query
      config:
        connection_string: "{{DB_URL}}"
        query: "SELECT status FROM orders WHERE id = $1"
        params: ["{{order_id}}"]
      assert:
        - rows[0].status == "confirmed"`,
  },
  Run: {
    filename: 'terminal',
    code: `testmesh run order-flow.yaml

# Output:
# ✓ create_order      201 OK          (143ms)
# ✓ verify_event      1 message found (2.1s)
# ✓ check_db          1 row matched   (12ms)
#
# All 3 steps passed in 2.3s`,
  },
};

const PROTOCOLS = [
  {
    name: 'HTTP & REST',
    desc: 'Assert status, headers, and body with expr-lang expressions.',
    action: 'action: http_request',
  },
  {
    name: 'Kafka',
    desc: 'Produce messages and consume to verify async event flows.',
    action: 'action: kafka_consumer',
  },
  {
    name: 'Databases',
    desc: 'Query PostgreSQL directly and assert on rows after API calls.',
    action: 'action: database_query',
  },
  {
    name: 'gRPC',
    desc: 'Call unary and streaming gRPC services by method name.',
    action: 'action: grpc_call',
  },
  {
    name: 'WebSocket',
    desc: 'Connect, send messages, and assert received payloads.',
    action: 'action: websocket',
  },
  {
    name: 'Redis',
    desc: 'Read and assert cache values after service operations.',
    action: 'action: redis_get',
  },
];

const ROLE_CARDS = [
  {
    title: "I'm new to TestMesh",
    desc: 'Install the CLI and write your first flow in 5 minutes.',
    badge: 'Start here',
    href: '/docs/getting-started',
  },
  {
    title: 'I want to test my microservices',
    desc: 'See a full E2E example testing HTTP, Kafka, and database state.',
    badge: 'E2E guide',
    href: '/docs/guides/microservices-testing',
  },
  {
    title: "I'm migrating from Postman / Cypress",
    desc: 'Map your existing tests and imports to TestMesh flows.',
    badge: 'Migration guide',
    href: '/docs/guides/migrating',
  },
];

const STATS = [
  { value: 'MIT License', label: 'Free forever, no vendor lock-in' },
  { value: 'Go + Next.js', label: 'Single binary backend, modern dashboard' },
  { value: '6 protocols', label: 'HTTP, Kafka, gRPC, WebSocket, DB, Redis' },
  { value: 'Open source', label: 'github.com/test-mesh/testmesh' },
];

const QUOTES = [
  {
    text: 'Finally, a tool that tests Kafka and HTTP in one file.',
    author: 'Developer, microservices team',
  },
  {
    text: 'Replaced our 200-line bash integration test with 40 lines of YAML.',
    author: 'Developer, microservices team',
  },
  {
    text: 'The mock server alone saved us weeks of setup.',
    author: 'Developer, microservices team',
  },
];

const COMPARISON_ROWS = [
  { feature: 'HTTP testing', testmesh: true, postman: true, k6: true, cypress: true },
  { feature: 'Kafka / async', testmesh: true, postman: false, k6: false, cypress: false },
  { feature: 'Database assertions', testmesh: true, postman: false, k6: false, cypress: false },
  { feature: 'gRPC', testmesh: true, postman: true, k6: false, cypress: false },
  { feature: 'WebSocket', testmesh: true, postman: true, k6: false, cypress: false },
  { feature: 'Multi-protocol in one flow', testmesh: true, postman: false, k6: false, cypress: false },
  { feature: 'YAML-defined flows', testmesh: true, postman: false, k6: false, cypress: false },
  { feature: 'Runs locally, no signup', testmesh: true, postman: false, k6: true, cypress: true },
  { feature: 'Mock server built-in', testmesh: true, postman: true, k6: false, cypress: false },
];

function Check({ val }: { val: boolean }) {
  return <span className="text-base">{val ? '✅' : '❌'}</span>;
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>('Install');

  return (
    <main className="flex flex-col">
      {/* ── Section 1: Hero ── */}
      <section className="flex flex-col items-center justify-center text-center px-4 py-24 gap-6">
        <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium mb-2 bg-fd-muted/40">
          Open source · Multi-protocol · CI/CD ready
        </div>

        <h1 className="text-4xl font-bold sm:text-5xl md:text-6xl max-w-3xl leading-tight">
          Your microservices work together.{' '}
          <span className="text-fd-primary">Your tests should too.</span>
        </h1>

        <p className="text-fd-muted-foreground text-lg max-w-2xl">
          TestMesh runs end-to-end integration tests across the full chain — HTTP calls, Kafka
          events, database state, Redis cache — in a single human-readable YAML flow.
        </p>

        <div className="flex gap-4 flex-wrap justify-center">
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center justify-center rounded-md bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow hover:bg-fd-primary/90 transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="https://github.com/test-mesh/testmesh"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 justify-center rounded-md border px-6 py-3 text-sm font-medium shadow hover:bg-fd-accent transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68a3.6 3.6 0 0 1 .1-2.64s.84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.4.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
            </svg>
            Star on GitHub
          </Link>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center text-sm text-fd-muted-foreground mt-2">
          <span>✓ Open source</span>
          <span>✓ Local-first, no cloud required</span>
          <span>✓ Multi-protocol</span>
          <span>✓ CI/CD ready</span>
        </div>
      </section>

      {/* ── Section 2: The Problem ── */}
      <section className="px-4 py-16 bg-fd-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">Five test tools for one user action</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {/* Left */}
            <div className="rounded-lg border bg-fd-card p-6">
              <p className="text-sm font-semibold text-fd-muted-foreground uppercase tracking-wide mb-4">
                What your stack does
              </p>
              <ol className="space-y-3 text-sm">
                {[
                  ['POST /orders', 'HTTP'],
                  ['→ Kafka event fired', 'Kafka'],
                  ['→ inventory-service updates DB', 'Database'],
                  ['→ notification-service sends WebSocket', 'WebSocket'],
                  ['→ cache invalidated in Redis', 'Redis'],
                ].map(([action, label], i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-fd-primary/10 text-fd-primary text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="flex-1">{action}</span>
                    <span className="text-xs rounded-full border px-2 py-0.5 text-fd-muted-foreground">
                      {label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Right */}
            <div className="rounded-lg border bg-fd-card p-6">
              <p className="text-sm font-semibold text-fd-muted-foreground uppercase tracking-wide mb-4">
                What your tests cover today
              </p>
              <ul className="space-y-3 text-sm">
                {[
                  ['HTTP test', 'Postman'],
                  ['Kafka test', 'custom script'],
                  ['DB assertion', 'manual SQL'],
                  ['WebSocket', 'untested'],
                  ['Redis', 'untested'],
                ].map(([test, tool], i) => (
                  <li key={i} className="flex items-center gap-3 text-red-500 line-through decoration-red-400">
                    <span className="flex-shrink-0">✗</span>
                    <span className="flex-1">{test}</span>
                    <span className="text-xs rounded-full border border-red-200 px-2 py-0.5 no-underline text-red-400">
                      {tool}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-lg font-semibold">
            TestMesh replaces all of them with one flow.
          </p>
        </div>
      </section>

      {/* ── Section 3: Quick Start ── */}
      <section className="px-4 py-16 max-w-4xl mx-auto w-full">
        <h2 className="text-2xl font-bold text-center mb-2">From zero to tested in 3 minutes</h2>
        <p className="text-center text-fd-muted-foreground mb-10 text-sm">
          Install the CLI, write a flow, run it. That&apos;s it.
        </p>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg border bg-fd-muted/40 p-1 mb-4 w-fit mx-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-5 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-fd-card shadow text-fd-foreground'
                  : 'text-fd-muted-foreground hover:text-fd-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Code block */}
        <div className="rounded-lg border bg-fd-card overflow-hidden">
          <div className="border-b px-4 py-2 text-xs text-fd-muted-foreground font-mono flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="ml-2">{TAB_CONTENT[activeTab].filename}</span>
          </div>
          <pre className="p-6 text-sm overflow-x-auto leading-relaxed">
            <code>{TAB_CONTENT[activeTab].code}</code>
          </pre>
        </div>
      </section>

      {/* ── Section 4: Protocol Coverage ── */}
      <section className="px-4 py-16 bg-fd-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">Every protocol your stack uses</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PROTOCOLS.map((p) => (
              <div key={p.name} className="rounded-lg border bg-fd-card p-5 flex flex-col gap-3">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-sm text-fd-muted-foreground flex-1">{p.desc}</p>
                <code className="text-xs bg-fd-muted/60 rounded px-2 py-1 font-mono self-start">
                  {p.action}
                </code>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 5: Role-based paths ── */}
      <section className="px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">Where do you want to start?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {ROLE_CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-lg border bg-fd-card p-6 flex flex-col gap-3 hover:border-fd-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-base group-hover:text-fd-primary transition-colors">
                    {card.title}
                  </h3>
                  <span className="flex-shrink-0 rounded-full bg-fd-primary/10 text-fd-primary text-xs font-medium px-2.5 py-0.5">
                    {card.badge}
                  </span>
                </div>
                <p className="text-sm text-fd-muted-foreground">{card.desc}</p>
                <span className="text-sm font-medium text-fd-primary mt-auto">
                  Read more →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 6: Open source metrics ── */}
      <section className="px-4 py-16 bg-fd-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">Built in the open</h2>

          {/* Stats bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-fd-border rounded-lg overflow-hidden border mb-12">
            {STATS.map((s) => (
              <div key={s.value} className="bg-fd-card px-6 py-5 text-center">
                <div className="text-lg font-bold mb-1">{s.value}</div>
                <div className="text-xs text-fd-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Quotes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {QUOTES.map((q, i) => (
              <div key={i} className="rounded-lg border bg-fd-card p-5">
                <p className="text-sm mb-3 leading-relaxed before:content-['\u201c'] after:content-['\u201d']">
                  {q.text}
                </p>
                <p className="text-xs text-fd-muted-foreground">{q.author}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 7: Comparison table ── */}
      <section className="px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-4">Not just another API tester</h2>
          <p className="text-center text-fd-muted-foreground text-sm mb-10">
            Built specifically for integration testing — testing how your services work together.
          </p>

          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-fd-muted/40">
                  <th className="text-left px-4 py-3 font-semibold">Feature</th>
                  <th className="text-center px-4 py-3 font-semibold">TestMesh</th>
                  <th className="text-center px-4 py-3 font-semibold text-fd-muted-foreground">Postman</th>
                  <th className="text-center px-4 py-3 font-semibold text-fd-muted-foreground">k6</th>
                  <th className="text-center px-4 py-3 font-semibold text-fd-muted-foreground">Cypress</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={row.feature} className={`border-b last:border-0 ${i % 2 === 1 ? 'bg-fd-muted/20' : ''}`}>
                    <td className="px-4 py-3 text-fd-muted-foreground">{row.feature}</td>
                    <td className="px-4 py-3 text-center"><Check val={row.testmesh} /></td>
                    <td className="px-4 py-3 text-center"><Check val={row.postman} /></td>
                    <td className="px-4 py-3 text-center"><Check val={row.k6} /></td>
                    <td className="px-4 py-3 text-center"><Check val={row.cypress} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-xs text-fd-muted-foreground mt-6 max-w-2xl mx-auto">
            Postman is great for API development. k6 is great for load testing. TestMesh is built
            for integration testing — testing how your services work together.
          </p>
        </div>
      </section>

      {/* ── Section 8: Final CTA ── */}
      <section className="flex flex-col items-center text-center px-4 py-24 gap-5 bg-fd-muted/30">
        <h2 className="text-3xl font-bold max-w-xl leading-tight">
          Stop testing protocols in isolation.
        </h2>
        <p className="text-fd-muted-foreground max-w-lg">
          Write one flow that tests the whole chain.
        </p>
        <div className="flex gap-4 flex-wrap justify-center mt-2">
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-md bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow hover:bg-fd-primary/90 transition-colors"
          >
            Read the docs
          </Link>
          <Link
            href="https://github.com/test-mesh/testmesh"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 justify-center rounded-md border px-6 py-3 text-sm font-medium shadow hover:bg-fd-accent transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68a3.6 3.6 0 0 1 .1-2.64s.84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.4.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
            </svg>
            View on GitHub
          </Link>
        </div>
      </section>
    </main>
  );
}
