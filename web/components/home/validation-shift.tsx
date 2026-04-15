export function ValidationShift() {
  return (
    <section className="px-4 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium mb-4 bg-fd-primary/10 text-fd-primary">
            A new category
          </div>
          <h2 className="text-2xl font-bold mb-4">From testing to validation.</h2>
          <p className="text-fd-muted-foreground text-sm max-w-2xl mx-auto leading-relaxed">
            Testing asks: <em>"Did the test pass?"</em> Validation asks:{' '}
            <em>"Is the system correct?"</em> These are fundamentally different questions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
          {/* Testing */}
          <div className="rounded-lg border bg-fd-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-2 h-2 rounded-full bg-fd-muted-foreground" />
              <span className="text-sm font-semibold text-fd-muted-foreground">Traditional testing</span>
            </div>
            <ul className="space-y-3 text-sm text-fd-muted-foreground">
              {[
                'Test isolated endpoints',
                'Assert HTTP status codes',
                'Mock external dependencies',
                'Pass/fail per request',
                'Coverage measured by lines of code',
                'Catch regressions after the fact',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5 text-fd-muted-foreground/50">—</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Validation */}
          <div className="rounded-lg border border-fd-primary/30 bg-fd-primary/5 p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-2 h-2 rounded-full bg-fd-primary" />
              <span className="text-sm font-semibold text-fd-primary">System validation</span>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                'Validate full service interaction chains',
                'Assert correct events, DB state, and timing',
                'Run against real system behavior via OTel',
                'Pass/fail per system scenario',
                'Coverage measured by real production flows',
                'Prevent incorrect system behavior before deploy',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-fd-primary flex-shrink-0 mt-0.5">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Category claim */}
        <div className="rounded-xl border bg-fd-card p-8 text-center">
          <p className="text-xs font-mono text-fd-muted-foreground uppercase tracking-widest mb-3">
            The category TestMesh creates
          </p>
          <p className="text-2xl font-bold mb-3">System Validation Platform</p>
          <p className="text-fd-muted-foreground text-sm max-w-xl mx-auto leading-relaxed">
            Not a QA tool. Not a testing framework. Not an API tester.
            A platform that understands your architecture, observes real system behavior, and
            automatically validates that your entire backend is correct — on every deploy.
          </p>
        </div>
      </div>
    </section>
  );
}
