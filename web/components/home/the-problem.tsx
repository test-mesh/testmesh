const PROBLEMS = [
  {
    number: '01',
    headline: 'No system-level testing exists',
    detail:
      'Teams test APIs, UIs, and units — but nobody tests service interactions, event flows, or data consistency across the full chain. The system behavior between services is a blind spot.',
    tags: ['service interactions', 'event flows', 'data consistency'],
  },
  {
    number: '02',
    headline: '"Works locally, breaks in prod"',
    detail:
      'Distributed systems fail in ways unit and API tests cannot catch: async timing, partial failures, retry storms, race conditions. These only surface under real system behavior.',
    tags: ['async behavior', 'retry storms', 'race conditions'],
  },
  {
    number: '03',
    headline: 'QA cannot keep up with engineering speed',
    detail:
      'Manual integration testing is too slow and too expensive to run on every deploy. Automation exists for UI flows and endpoints — but backend correctness across services remains largely unverified.',
    tags: ['manual testing', 'incomplete coverage', 'slow feedback'],
  },
  {
    number: '04',
    headline: 'Observability shows what happened — not what should happen',
    detail:
      'Datadog and Grafana tell you a service crashed. They cannot tell you whether the system behaved correctly. Monitoring is not validation.',
    tags: ['Datadog', 'Grafana', 'monitoring ≠ validation'],
  },
];

export function TheProblem() {
  return (
    <section className="px-4 py-16 bg-fd-muted/30">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-4">
          Distributed systems have a validation gap.
        </h2>
        <p className="text-center text-fd-muted-foreground text-sm mb-12 max-w-2xl mx-auto">
          Modern backends are distributed, event-driven, and complex. Testing is still
          endpoint-based, manual, and incomplete.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PROBLEMS.map((p) => (
            <div key={p.number} className="rounded-lg border bg-fd-card p-6 flex flex-col gap-3">
              <span className="text-xs font-mono text-fd-primary font-bold">{p.number}</span>
              <h3 className="font-semibold text-base">{p.headline}</h3>
              <p className="text-sm text-fd-muted-foreground leading-relaxed">{p.detail}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {p.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs rounded-full border px-2.5 py-0.5 text-fd-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
