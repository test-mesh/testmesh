export function FailureAnalysis() {
  return (
    <section className="px-4 py-16">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-4">Built for when things go wrong.</h2>
        <p className="text-center text-fd-muted-foreground text-sm mb-12 max-w-xl mx-auto">
          Not just finding failures — understanding them.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Failure Simulation */}
          <div className="rounded-lg border bg-fd-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-base">
                ⚡
              </div>
              <h3 className="font-semibold">Failure Simulation</h3>
            </div>
            <p className="text-sm text-fd-muted-foreground mb-4 leading-relaxed">
              Inject faults directly into flows to validate degradation behavior before it happens
              in production.
            </p>
            <ul className="space-y-2 text-sm text-fd-muted-foreground">
              {[
                'Kafka message delays and partition failures',
                'Database connection timeouts',
                'Network latency and packet loss',
                'Retry storm simulation',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="text-red-400 text-xs flex-shrink-0">✗</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Root Cause Analysis */}
          <div className="rounded-lg border bg-fd-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-fd-primary/10 flex items-center justify-center text-base">
                🔍
              </div>
              <h3 className="font-semibold">Root Cause Analysis</h3>
            </div>
            <p className="text-sm text-fd-muted-foreground mb-4 leading-relaxed">
              When a flow fails, TestMesh diffs the Expected Graph against the Actual OTel Trace and
              pins the exact divergence point.
            </p>
            <div className="rounded-md border bg-fd-muted/40 p-3 text-xs font-mono leading-relaxed">
              <div className="text-fd-muted-foreground mb-1">Expected:</div>
              <div className="text-green-500 mb-3">
                order-service → kafka → inventory-service
              </div>
              <div className="text-fd-muted-foreground mb-1">Actual:</div>
              <div className="text-red-400 mb-2">
                order-service → kafka →{' '}
                <span className="underline decoration-dotted">timeout after 5s</span>
              </div>
              <div className="text-fd-muted-foreground" style={{ fontSize: '10px' }}>
                ↳ inventory-service consumer group lag: 48,231 messages
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
