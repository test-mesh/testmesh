const CANVAS_FEATURES = [
  {
    title: 'Spatial Canvas',
    desc: 'Pan, zoom, and arrange nodes on an infinite canvas. Flows are diagrams, not text files.',
  },
  {
    title: 'Two-way YAML Sync',
    desc: 'Edit in the canvas or the YAML drawer — changes propagate instantly in both directions.',
  },
  {
    title: 'Live Execution',
    desc: 'Status overlays update in real time as each step executes. Failures pin to the exact node.',
  },
];

export function VisualCanvas() {
  return (
    <section
      className="px-4 py-16"
      style={{ backgroundColor: 'oklch(0.145 0 0)', color: 'oklch(0.985 0 0)' }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium mb-4"
            style={{ borderColor: 'oklch(1 0 0 / 10%)', backgroundColor: 'oklch(1 0 0 / 5%)' }}
          >
            Visual Interface
          </div>
          <h2 className="text-2xl font-bold mb-4">Your test suite as a living diagram.</h2>
          <p className="text-sm leading-relaxed max-w-2xl mx-auto" style={{ color: 'oklch(0.708 0 0)' }}>
            Build and debug integration tests on a spatial canvas. Each action is a node — HTTP,
            Kafka, Redis, gRPC — connected by bezier curves that show data flow. Click any node to
            configure it. The YAML syncs in real time.
          </p>
        </div>

        {/* Canvas mockup */}
        <div
          aria-hidden="true"
          className="rounded-xl overflow-hidden mb-6"
          style={{ border: '1px solid oklch(1 0 0 / 10%)', backgroundColor: 'oklch(0.205 0 0)' }}
        >
          {/* Window chrome */}
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ borderBottom: '1px solid oklch(1 0 0 / 10%)' }}
          >
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'oklch(0.62 0.19 26)' }} />
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'oklch(0.80 0.17 85)' }} />
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'oklch(0.72 0.19 145)' }} />
            <span className="ml-3 text-xs font-mono" style={{ color: 'oklch(0.556 0 0)' }}>
              Order Lifecycle Flow — TestMesh Canvas
            </span>
          </div>

          {/* Nodes */}
          <div className="p-8 min-h-56 flex items-center justify-center flex-wrap gap-4">
            {/* HTTP Node */}
            <div
              className="rounded-lg p-4 w-44"
              style={{ border: '1px solid oklch(0.72 0.19 12 / 40%)', backgroundColor: 'oklch(0.72 0.19 12 / 10%)' }}
            >
              <div className="w-full h-1 rounded-full mb-3" style={{ backgroundColor: '#FCA5A5' }} />
              <div className="text-xs font-mono mb-1" style={{ color: '#FCA5A5' }}>http_request</div>
              <div className="text-sm font-medium">POST /orders</div>
              <div className="text-xs mt-1" style={{ color: 'oklch(0.556 0 0)' }}>201 OK · 143ms</div>
            </div>

            <div className="text-lg" style={{ color: 'oklch(0.45 0 0)' }}>→</div>

            {/* Kafka Node */}
            <div
              className="rounded-lg p-4 w-44"
              style={{ border: '1px solid oklch(0.90 0.17 93 / 40%)', backgroundColor: 'oklch(0.90 0.17 93 / 8%)' }}
            >
              <div className="w-full h-1 rounded-full mb-3" style={{ backgroundColor: '#FDE047' }} />
              <div className="text-xs font-mono mb-1" style={{ color: '#FDE047' }}>kafka_consumer</div>
              <div className="text-sm font-medium">order-events</div>
              <div className="text-xs mt-1" style={{ color: 'oklch(0.556 0 0)' }}>1 msg · 2.1s</div>
            </div>

            <div className="text-lg" style={{ color: 'oklch(0.45 0 0)' }}>→</div>

            {/* DB Node */}
            <div
              className="rounded-lg p-4 w-44"
              style={{ border: '1px solid oklch(0.72 0.19 145 / 40%)', backgroundColor: 'oklch(0.72 0.19 145 / 8%)' }}
            >
              <div className="w-full h-1 rounded-full mb-3" style={{ backgroundColor: '#86EFAC' }} />
              <div className="text-xs font-mono mb-1" style={{ color: '#86EFAC' }}>database_query</div>
              <div className="text-sm font-medium">SELECT status</div>
              <div className="text-xs mt-1" style={{ color: 'oklch(0.556 0 0)' }}>confirmed · 12ms</div>
            </div>
          </div>
        </div>

        {/* Feature bullets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CANVAS_FEATURES.map(({ title, desc }) => (
            <div
              key={title}
              className="rounded-lg p-4"
              style={{ border: '1px solid oklch(1 0 0 / 10%)', backgroundColor: 'oklch(1 0 0 / 4%)' }}
            >
              <div className="font-semibold text-sm mb-2">{title}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'oklch(0.708 0 0)' }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
