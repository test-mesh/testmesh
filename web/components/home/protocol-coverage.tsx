const PROTOCOLS = [
  { name: 'HTTP & REST', desc: 'Assert status, headers, and body with expr-lang expressions.', action: 'action: http_request' },
  { name: 'Kafka', desc: 'Produce messages and consume to verify async event flows.', action: 'action: kafka_consumer' },
  { name: 'Databases', desc: 'Query PostgreSQL directly and assert on rows after API calls.', action: 'action: database_query' },
  { name: 'gRPC', desc: 'Call unary and streaming gRPC services by method name.', action: 'action: grpc_call' },
  { name: 'WebSocket', desc: 'Connect, send messages, and assert received payloads.', action: 'action: websocket' },
  { name: 'Redis', desc: 'Read and assert cache values after service operations.', action: 'action: redis_get' },
];

export function ProtocolCoverage() {
  return (
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
  );
}
