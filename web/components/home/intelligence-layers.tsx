const LAYERS = [
  {
    number: '01',
    name: 'System Graph',
    tag: 'Structure',
    description:
      'Maps how the system is supposed to work — services, APIs, queues, and databases and their relationships. The source of truth for what correct behavior looks like.',
  },
  {
    number: '02',
    name: 'Telemetry',
    tag: 'Reality',
    description:
      'Uses OpenTelemetry to observe real-time behavior across your distributed system and detect drift from the expected graph.',
  },
  {
    number: '03',
    name: 'LLM',
    tag: 'Intelligence',
    description:
      'Generates test scenarios from your actual traffic, explains failures in plain language, and adapts your test suite automatically when the system changes.',
  },
];

export function IntelligenceLayers() {
  return (
    <section className="px-4 py-16 bg-fd-muted/30">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-4">
          Not just a test runner. A validation system.
        </h2>
        <p className="text-center text-fd-muted-foreground text-sm mb-12 max-w-2xl mx-auto">
          Three layers of intelligence work together to validate your entire distributed system —
          not individual endpoints.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {LAYERS.map((layer) => (
            <div key={layer.number} className="rounded-lg border bg-fd-card p-6 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-fd-primary font-bold">{layer.number}</span>
                <span className="text-xs rounded-full bg-fd-primary/10 text-fd-primary px-2.5 py-0.5 font-medium">
                  {layer.tag}
                </span>
              </div>
              <h3 className="font-semibold text-lg">{layer.name}</h3>
              <p className="text-sm text-fd-muted-foreground leading-relaxed">{layer.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
