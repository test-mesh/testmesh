import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <div className="max-w-2xl">
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
          TestMesh Documentation
        </h1>
        <p className="mb-8 text-lg text-muted-foreground">
          Build, manage, and execute tests at scale with TestMesh&apos;s
          open-source test automation platform.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/docs"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Get Started
          </Link>
          <Link
            href="/docs/api-reference"
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            API Reference
          </Link>
        </div>
      </div>
    </main>
  );
}
