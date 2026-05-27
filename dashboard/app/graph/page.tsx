'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatsBar } from '@/components/graph/StatsBar';
import { RepoTable } from '@/components/graph/RepoTable';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { CoveragePanel } from '@/components/graph/CoveragePanel';
import { ConflictsPanel } from '@/components/graph/ConflictsPanel';

export default function GraphPage() {
  return (
    <div className="px-6 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#c8dce8]">System Graph</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Discover services, APIs, and their dependencies across your codebase.</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-[#0f1923] border border-[#1e2d3d] p-0.5 h-auto rounded-lg mb-4">
          {['overview', 'explorer', 'coverage', 'conflicts'].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="text-xs px-3 py-1.5 capitalize data-[state=active]:bg-[#1a2d3d] data-[state=active]:text-[#c8dce8] text-[#4a6480] rounded-md"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <StatsBar />
          <RepoTable />
        </TabsContent>

        <TabsContent value="explorer">
          <GraphCanvas />
        </TabsContent>

        <TabsContent value="coverage">
          <CoveragePanel />
        </TabsContent>

        <TabsContent value="conflicts">
          <ConflictsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
