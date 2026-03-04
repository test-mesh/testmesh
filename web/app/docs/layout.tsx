import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";
import type { ReactNode } from "react";
import { BookOpen, Plug, Terminal, Zap } from "lucide-react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: (
          <span className="font-semibold">
            <span className="text-primary">Test</span>Mesh
          </span>
        ),
        url: "/",
      }}
      sidebar={{
        defaultOpenLevel: 1,
      }}
      links={[
        {
          text: "Guides",
          url: "/docs/guides",
          icon: <BookOpen className="size-4" />,
        },
        {
          text: "API Reference",
          url: "/docs/api-reference",
          icon: <Terminal className="size-4" />,
        },
        {
          text: "Plugins",
          url: "/docs/plugins",
          icon: <Plug className="size-4" />,
        },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
