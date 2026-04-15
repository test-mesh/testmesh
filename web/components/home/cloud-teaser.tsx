export function CloudTeaser() {
  return (
    <section className="px-4 py-16">
      <div className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium mb-6 bg-fd-primary/10 text-fd-primary">
          Coming soon
        </div>
        <h2 className="text-2xl font-bold mb-4">TestMesh Cloud</h2>
        <p className="text-fd-muted-foreground mb-8 max-w-xl mx-auto text-sm leading-relaxed">
          Multi-tenancy, SSO, AI agents, GitHub integration, and a hosted control plane — built on
          the same OSS engine. One-click deployment, zero infrastructure to manage.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {['Multi-tenancy', 'SSO / SAML', 'AI agents', 'GitHub integration'].map((feature) => (
            <div
              key={feature}
              className="rounded-lg border bg-fd-card px-4 py-3 text-sm text-fd-muted-foreground"
            >
              {feature}
            </div>
          ))}
        </div>

        <a
          href="https://github.com/test-mesh/testmesh/discussions"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md border px-6 py-3 text-sm font-medium shadow hover:bg-fd-accent/20 transition-colors"
        >
          Watch this space →
        </a>
      </div>
    </section>
  );
}
