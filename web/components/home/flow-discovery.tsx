const DISCOVERED_YAML = `flow:
  name: "Discovered: Order Lifecycle"
  # Auto-generated from OTel trace 2026-04-14T09:32:11Z
  steps:
    - id: create_order
      action: http_request
      config:
        method: POST
        url: "{{BASE_URL}}/orders"
      assert:
        - status == 201
      output:
        order_id: $.body.id

    - id: verify_event
      action: kafka_consumer
      config:
        topic: "order-events"
        timeout: 10s
      assert:
        - messages[0].value.order_id == "{{order_id}}"`;

export function FlowDiscovery() {
  return (
    <section className="px-4 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Left: copy */}
          <div>
            <div className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium mb-4 bg-fd-primary/10 text-fd-primary">
              Automatic Flow Discovery
            </div>
            <h2 className="text-2xl font-bold mb-4">Your system already knows what to test.</h2>
            <p className="text-fd-muted-foreground text-sm leading-relaxed mb-6">
              When OpenTelemetry is connected, TestMesh detects real flows from live traffic — API
              call chains, Kafka fan-outs, cache patterns — and generates a test suite from actual
              behavior rather than assumptions.
            </p>
            <ul className="space-y-2 text-sm text-fd-muted-foreground">
              {[
                'Detects multi-service call chains from OTel traces',
                'Identifies Kafka fan-out patterns automatically',
                'Flags untested paths appearing in production traffic',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-fd-primary mt-0.5 flex-shrink-0">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: code block */}
          <div className="rounded-lg border bg-fd-card overflow-hidden">
            <div className="border-b px-4 py-2 text-xs text-fd-muted-foreground font-mono flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
              <span className="ml-2">discovered-order-flow.yaml</span>
            </div>
            <pre className="p-5 text-xs overflow-x-auto leading-relaxed">
              <code>{DISCOVERED_YAML}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
