import Link from 'next/link';

function GitHubIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68a3.6 3.6 0 0 1 .1-2.64s.84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.4.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
    </svg>
  );
}

export function FinalCta() {
  return (
    <section className="flex flex-col items-center text-center px-4 py-24 gap-5 bg-fd-muted/30">
      <h2 className="text-3xl font-bold max-w-xl leading-tight">
        Stop testing protocols in isolation.
      </h2>
      <p className="text-fd-muted-foreground max-w-lg">
        Write one flow that validates the whole chain.
      </p>
      <div className="flex gap-4 flex-wrap justify-center mt-2">
        <Link
          href="/docs"
          className="inline-flex items-center justify-center rounded-md bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow hover:bg-fd-primary/90 transition-colors"
        >
          Read the docs
        </Link>
        <Link
          href="https://github.com/test-mesh/testmesh"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 justify-center rounded-md border px-6 py-3 text-sm font-medium shadow hover:bg-fd-accent/20 transition-colors"
        >
          <GitHubIcon />
          View on GitHub
        </Link>
      </div>
    </section>
  );
}
