'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Network } from 'lucide-react';
import { StatsBar } from '@/components/graph/StatsBar';
import { RepoTable } from '@/components/graph/RepoTable';
import { GraphCanvas } from '@/components/graph/GraphCanvas';

export default function GraphPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Network className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold">System Graph</h1>
          <p className="text-sm text-muted-foreground">
            Discover services, APIs, and their dependencies across your codebase.
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="explorer">Explorer</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 flex flex-col gap-6">
          <StatsBar />
          <RepoTable />
        </TabsContent>

        <TabsContent value="explorer" className="mt-4">
          <GraphCanvas />
        </TabsContent>

        <TabsContent value="coverage" className="mt-4">
          <p className="text-muted-foreground text-sm">Coverage panel — coming soon.</p>
        </TabsContent>

        <TabsContent value="conflicts" className="mt-4">
          <p className="text-muted-foreground text-sm">Conflicts panel — coming soon.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
