import Link from 'next/link';

function GitHubIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68a3.6 3.6 0 0 1 .1-2.64s.84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.4.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
    </svg>
  );
}

export function Hero() {
  return (
    <section className="flex flex-col items-center justify-center text-center px-4 py-24 gap-6">
      <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium mb-2 bg-fd-muted/40">
        Open source · MIT License · Local-first · CI/CD ready
      </div>

      <h1 className="text-4xl font-bold sm:text-5xl md:text-6xl max-w-3xl leading-tight">
        Validate entire system behaviors{' '}
        <span className="text-fd-primary">before production failures occur.</span>
      </h1>

      <p className="text-fd-muted-foreground text-lg max-w-2xl">
        System Graph maps how your services are supposed to work. OpenTelemetry captures what they
        actually do. The LLM generates scenarios, explains failures, and adapts tests automatically.
      </p>

      <div className="flex gap-4 flex-wrap justify-center">
        <Link
          href="/docs/getting-started"
          className="inline-flex items-center justify-center rounded-md bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow hover:bg-fd-primary/90 transition-colors"
        >
          Get Started →
        </Link>
        <Link
          href="https://github.com/test-mesh/testmesh"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 justify-center rounded-md border px-6 py-3 text-sm font-medium shadow hover:bg-fd-accent/20 transition-colors"
        >
          <GitHubIcon />
          Star on GitHub
        </Link>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center text-sm text-fd-muted-foreground mt-2">
        <span>✓ Open source</span>
        <span>✓ Local-first, no cloud required</span>
        <span>✓ Multi-protocol</span>
        <span>✓ CI/CD ready</span>
      </div>
    </section>
  );
}
