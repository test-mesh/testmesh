'use client';

import { useState } from 'react';

const TABS = ['Install', 'Write', 'Run'] as const;
type Tab = (typeof TABS)[number];

const TAB_CONTENT: Record<Tab, { filename: string; code: string }> = {
  Install: {
    filename: 'terminal',
    code: `# macOS / Linux
curl -fsSL https://testmesh.io/install.sh | sh

# Homebrew
brew install test-mesh/brew/testmesh

# npm
npm install -g @testmesh/cli

testmesh --help`,
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

export function QuickStart() {
  const [activeTab, setActiveTab] = useState<Tab>('Install');

  return (
    <section className="px-4 py-16 max-w-4xl mx-auto w-full">
      <h2 className="text-2xl font-bold text-center mb-2">From zero to tested in 3 minutes</h2>
      <p className="text-center text-fd-muted-foreground mb-10 text-sm">
        Install the CLI, write a flow, run it. That&apos;s it.
      </p>

      {/* Tab bar */}
      <div role="tablist" className="flex gap-1 rounded-lg border bg-fd-muted/40 p-1 mb-4 w-fit mx-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
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
      <div role="tabpanel" className="rounded-lg border bg-fd-card overflow-hidden">
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
  );
}
