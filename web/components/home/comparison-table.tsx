const ROWS = [
  {
    what: 'Correct services were called in the right order',
    current: false,
    testmesh: true,
  },
  {
    what: 'Correct Kafka events were emitted with correct payloads',
    current: false,
    testmesh: true,
  },
  {
    what: 'Database state is correct after the full chain executes',
    current: false,
    testmesh: true,
  },
  {
    what: 'Retries and timeouts behave correctly under failure',
    current: false,
    testmesh: true,
  },
  {
    what: 'Race conditions and partial failures are handled',
    current: false,
    testmesh: true,
  },
  {
    what: 'All downstream side effects occurred (cache, notifications, etc.)',
    current: false,
    testmesh: true,
  },
  {
    what: 'Individual API endpoints return correct status codes',
    current: true,
    testmesh: true,
  },
  {
    what: 'Services pass their own unit tests',
    current: true,
    testmesh: true,
  },
];

function Cell({ val, strong }: { val: boolean; strong?: boolean }) {
  if (val) {
    return (
      <span className={strong ? 'text-fd-primary font-medium text-sm' : 'text-fd-muted-foreground text-sm'}>
        {strong ? '✓ Yes' : '✓'}
      </span>
    );
  }
  return <span className="text-red-400 text-sm font-medium">✗ No</span>;
}

export function ComparisonTable() {
  return (
    <section className="px-4 py-16">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-4">
          What actually breaks in production — and what you test today.
        </h2>
        <p className="text-center text-fd-muted-foreground text-sm mb-10 max-w-2xl mx-auto">
          Postman, k6, and Cypress are excellent tools. None of them validate system behavior.
          That gap is what TestMesh fills.
        </p>

        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-fd-muted/40">
                <th className="text-left px-4 py-3 font-semibold">Validation requirement</th>
                <th className="text-center px-4 py-3 font-semibold text-fd-muted-foreground whitespace-nowrap">
                  Postman / k6 / Cypress
                </th>
                <th className="text-center px-4 py-3 font-semibold whitespace-nowrap">TestMesh</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.what}
                  className={`border-b last:border-0 ${i % 2 === 1 ? 'bg-fd-muted/20' : ''}`}
                >
                  <td className="px-4 py-3 text-fd-muted-foreground">{row.what}</td>
                  <td className="px-4 py-3 text-center">
                    <Cell val={row.current} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Cell val={row.testmesh} strong />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-xs text-fd-muted-foreground mt-6 max-w-2xl mx-auto">
          Keep using your existing tools for what they're good at. Add TestMesh for what they can't do.
        </p>
      </div>
    </section>
  );
}
