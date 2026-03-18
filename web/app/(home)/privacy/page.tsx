import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — TestMesh',
  description: 'Privacy policy for TestMesh and the TestMesh Claude Code plugin.',
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-fd-muted-foreground mb-10">Last updated: March 2026</p>

      <section className="space-y-8 text-fd-foreground">
        <div>
          <h2 className="text-xl font-semibold mb-3">Overview</h2>
          <p className="leading-relaxed text-fd-muted-foreground">
            TestMesh is a local-first platform for writing and running end-to-end integration tests.
            The TestMesh CLI, API server, and Claude Code plugin run entirely on your own
            infrastructure. We do not collect, transmit, or store your test data, flow definitions,
            or execution results on our servers.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Claude Code Plugin</h2>
          <p className="leading-relaxed text-fd-muted-foreground">
            The TestMesh Claude Code plugin registers a local MCP (Model Context Protocol) server
            that connects Claude Code to the <code className="text-fd-foreground font-mono text-sm">testmesh</code> binary
            running on your machine. All communication between Claude Code and TestMesh happens
            locally over stdio. No data is sent to TestMesh servers as part of this integration.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Data we do not collect</h2>
          <ul className="list-disc list-inside space-y-1 text-fd-muted-foreground leading-relaxed">
            <li>Flow definitions or YAML content</li>
            <li>Test execution results or logs</li>
            <li>Database queries or connection strings</li>
            <li>API requests or responses made during test runs</li>
            <li>Personally identifiable information from your test data</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Website analytics</h2>
          <p className="leading-relaxed text-fd-muted-foreground">
            This website may collect anonymous page view data (e.g. pages visited, referrer) to
            understand how developers discover TestMesh. No personal information is collected or
            shared with third parties.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Contact</h2>
          <p className="leading-relaxed text-fd-muted-foreground">
            If you have questions about this policy, open an issue on{' '}
            <a
              href="https://github.com/test-mesh/testmesh"
              className="text-fd-foreground underline underline-offset-4"
            >
              GitHub
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
