'use client';

import { memo } from 'react';
import type { NodeProps } from 'reactflow';
import { Settings2, Play, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowSection } from '../types';

interface SectionHeaderData {
  label: string;
  section: FlowSection;
}

const sectionConfig: Record<FlowSection, { icon: React.ElementType; color: string; description: string }> = {
  setup: {
    icon: Settings2,
    color: 'text-blue-500 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800',
    description: 'Runs before main steps',
  },
  steps: {
    icon: Play,
    color: 'text-green-500 border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800',
    description: 'Main test steps',
  },
  teardown: {
    icon: Flag,
    color: 'text-orange-500 border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800',
    description: 'Cleanup after tests',
  },
};

function SectionHeaderNode({ data }: NodeProps<SectionHeaderData>) {
  const config = sectionConfig[data.section] || sectionConfig.steps;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 rounded-lg border-2 border-dashed',
        config.color
      )}
    >
      <Icon className="w-5 h-5" />
      <div>
        <div className="font-semibold text-sm">{data.label}</div>
        <div className="text-xs text-muted-foreground">{config.description}</div>
      </div>
    </div>
  );
}

export default memo(SectionHeaderNode);
