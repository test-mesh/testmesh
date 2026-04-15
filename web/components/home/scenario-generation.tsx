const SCENARIO_TYPES = [
  {
    label: 'Happy path',
    desc: 'Full successful flow across all services',
    color: 'text-green-500',
  },
  {
    label: 'Failure scenarios',
    desc: 'Timeout, retry, partial failure, cascade',
    color: 'text-red-400',
  },
  {
    label: 'Edge cases',
    desc: 'Empty payloads, duplicate events, out-of-order messages',
    color: 'text-yellow-500',
  },
  {
    label: 'Load patterns',
    desc: 'Burst traffic, consumer lag, backpressure',
    color: 'text-fd-primary',
  },
];

export function ScenarioGeneration() {
  return (
    <section className="px-4 py-16 bg-fd-muted/30">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-4">
          Agentic scenario generation.
        </h2>
        <p className="text-center text-fd-muted-foreground text-sm mb-12 max-w-2xl mx-auto">
          TestMesh reads your system graph, observes real traffic, and generates the scenarios that
          actually matter — not the ones a developer thought to write.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {/* Scenario types */}
          <div className="rounded-lg border bg-fd-card p-6 md:col-span-1">
            <p className="text-xs font-semibold text-fd-muted-foreground uppercase tracking-wide mb-4">
              Generated automatically
            </p>
            <ul className="space-y-4">
              {SCENARIO_TYPES.map(({ label, desc, color }) => (
                <li key={label} className="flex flex-col gap-0.5">
                  <span className={`text-sm font-medium ${color}`}>{label}</span>
                  <span className="text-xs text-fd-muted-foreground">{desc}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CI/CD */}
          <div className="rounded-lg border bg-fd-card p-6 flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold text-fd-muted-foreground uppercase tracking-wide mb-2">
                CI/CD integration
              </p>
              <h3 className="font-semibold mb-2">Runs on every deploy. Blocks broken releases.</h3>
              <p className="text-sm text-fd-muted-foreground leading-relaxed">
                Drop TestMesh into your pipeline. On each deploy, it re-validates the full system
                graph against real behavior. A single incorrect interaction blocks the release.
              </p>
            </div>
            <div className="rounded-md border bg-fd-muted/40 p-3 text-xs font-mono">
              <div className="text-fd-muted-foreground mb-1"># GitHub Actions</div>
              <div className="text-fd-foreground">- name: Validate system</div>
              <div className="text-fd-foreground ml-2">run: testmesh run --ci</div>
              <div className="text-green-500 mt-2">✓ 47 scenarios passed</div>
              <div className="text-red-400">✗ Deploy blocked: 1 failure</div>
            </div>
          </div>

          {/* Coverage */}
          <div className="rounded-lg border bg-fd-card p-6 flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold text-fd-muted-foreground uppercase tracking-wide mb-2">
                Real coverage
              </p>
              <h3 className="font-semibold mb-2">Coverage based on reality — not lines of code.</h3>
              <p className="text-sm text-fd-muted-foreground leading-relaxed">
                TestMesh measures what percentage of your real production flows are validated. Not
                which lines were executed. Fake coverage metrics don't catch production failures.
              </p>
            </div>
            <div className="space-y-2">
              {[
                { flow: 'Order lifecycle', pct: 94 },
                { flow: 'Payment processing', pct: 81 },
                { flow: 'Notification fanout', pct: 47 },
                { flow: 'Inventory sync', pct: 12 },
              ].map(({ flow, pct }) => (
                <div key={flow}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-fd-muted-foreground">{flow}</span>
                    <span className={pct < 50 ? 'text-red-400' : 'text-fd-foreground'}>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-fd-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct < 50 ? 'bg-red-400' : 'bg-fd-primary'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Self-healing note */}
        <div className="rounded-lg border bg-fd-card px-6 py-4 flex items-start gap-4">
          <div className="w-8 h-8 rounded-lg bg-fd-primary/10 flex items-center justify-center text-fd-primary flex-shrink-0 text-base mt-0.5">
            ♻
          </div>
          <div>
            <p className="font-semibold text-sm mb-1">Self-adapting flows</p>
            <p className="text-sm text-fd-muted-foreground leading-relaxed">
              When your system changes — a new service, a renamed event, a schema migration — TestMesh
              detects the drift and updates affected flows automatically. No broken tests after every
              refactor.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
