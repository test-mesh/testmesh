import { Hero } from '@/components/home/hero';
import { ValidationShift } from '@/components/home/validation-shift';
import { TheProblem } from '@/components/home/the-problem';
import { IntelligenceLayers } from '@/components/home/intelligence-layers';
import { VisualCanvas } from '@/components/home/visual-canvas';
import { FlowDiscovery } from '@/components/home/flow-discovery';
import { ScenarioGeneration } from '@/components/home/scenario-generation';
import { FailureAnalysis } from '@/components/home/failure-analysis';
import { ProtocolCoverage } from '@/components/home/protocol-coverage';
import { QuickStart } from '@/components/home/quick-start';
import { ComparisonTable } from '@/components/home/comparison-table';
import { CloudTeaser } from '@/components/home/cloud-teaser';
import { FinalCta } from '@/components/home/final-cta';

export default function HomePage() {
  return (
    <main className="flex flex-col">
      <Hero />
      <ValidationShift />
      <TheProblem />
      <IntelligenceLayers />
      <VisualCanvas />
      <FlowDiscovery />
      <ScenarioGeneration />
      <FailureAnalysis />
      <ProtocolCoverage />
      <QuickStart />
      <ComparisonTable />
      <CloudTeaser />
      <FinalCta />
    </main>
  );
}
