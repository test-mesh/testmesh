'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useFlowVersions,
  useFlowVersion,
  useCompareFlowVersions,
} from '@/lib/hooks/useCollaboration';
import type { FlowVersion } from '@/lib/api/collaboration';
import {
  History,
  GitCompare,
  Clock,
  User,
  RefreshCw,
  ChevronRight,
  FileCode,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface VersionHistoryProps {
  flowId: string;
  onRestore?: (version: FlowVersion) => void;
  className?: string;
}

export function VersionHistory({ flowId, onRestore, className }: VersionHistoryProps) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const { data: versionsData, isLoading } = useFlowVersions(flowId, 50);
  const { data: versionDetail, isLoading: detailLoading } = useFlowVersion(
    flowId,
    selectedVersion || 0
  );
  const { data: comparisonData, isLoading: comparisonLoading } = useCompareFlowVersions(
    flowId,
    selectedVersion || 0,
    compareVersion || 0
  );

  const versions = versionsData?.versions || [];

  const handleVersionSelect = (version: number) => {
    if (isComparing && selectedVersion) {
      setCompareVersion(version);
    } else {
      setSelectedVersion(version);
      setCompareVersion(null);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 h-7 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors',
            className
          )}
        >
          <History className="h-3.5 w-3.5" />
          Version History
          {versions.length > 0 && (
            <span className="ml-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
              {versions.length}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="!w-[min(900px,90vw)] !max-w-none px-6 bg-[#0b0f18] border-l border-[#1e2d3d]">
        <SheetHeader className="px-0">
          <SheetTitle className="flex items-center gap-2 text-[#c8dce8]">
            <History className="h-4 w-4" />
            Version History
          </SheetTitle>
          <SheetDescription className="text-[#4a6480]">
            Browse and compare previous versions of this flow
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Compare Mode Toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setIsComparing(!isComparing);
                setCompareVersion(null);
              }}
              className={cn(
                'flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium transition-colors',
                isComparing
                  ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                  : 'border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8]'
              )}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {isComparing ? 'Comparing' : 'Compare Versions'}
            </button>
            {isComparing && selectedVersion && (
              <span className="text-xs text-[#4a6480]">
                Select another version to compare
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Version List */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#3d5670] uppercase tracking-wider">Versions</h4>
              <ScrollArea className="h-[500px] rounded-lg border border-[#1e2d3d] p-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" />
                  </div>
                ) : versions.length === 0 ? (
                  <div className="text-center py-8 text-[#3d5670]">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">No version history</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {versions.map((version) => (
                      <VersionItem
                        key={version.id}
                        version={version}
                        isSelected={selectedVersion === version.version}
                        isCompareTarget={compareVersion === version.version}
                        onClick={() => handleVersionSelect(version.version)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Version Detail / Comparison */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#3d5670] uppercase tracking-wider">
                {isComparing && compareVersion ? 'Comparison' : 'Details'}
              </h4>
              <ScrollArea className="h-[500px] rounded-lg border border-[#1e2d3d] p-2">
                {isComparing && selectedVersion && compareVersion ? (
                  comparisonLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" />
                    </div>
                  ) : comparisonData ? (
                    <VersionComparison
                      v1={comparisonData.version1}
                      v2={comparisonData.version2}
                    />
                  ) : (
                    <div className="text-center py-8 text-[#3d5670]">
                      <p className="text-xs">Select two versions to compare</p>
                    </div>
                  )
                ) : selectedVersion && versionDetail ? (
                  detailLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" />
                    </div>
                  ) : (
                    <VersionDetail version={versionDetail} onRestore={onRestore} />
                  )
                ) : (
                  <div className="text-center py-8 text-[#3d5670]">
                    <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Select a version to view details</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VersionItem({
  version,
  isSelected,
  isCompareTarget,
  onClick,
}: {
  version: FlowVersion;
  isSelected: boolean;
  isCompareTarget: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-2 rounded-lg transition-colors',
        'hover:bg-[#131b26]',
        isSelected && 'bg-teal-400/5 border border-teal-400/30',
        isCompareTarget && 'bg-blue-400/5 border border-blue-400/30'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#c8dce8]">v{version.version}</span>
        {(isSelected || isCompareTarget) && (
          <span className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded',
            isSelected ? 'bg-teal-400/15 text-teal-400' : 'bg-blue-400/10 text-blue-400'
          )}>
            {isSelected ? 'Selected' : 'Compare'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[#3d5670]">
        <Clock className="h-2.5 w-2.5" />
        {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
      </div>
      {version.author_name && (
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[#3d5670]">
          <User className="h-2.5 w-2.5" />
          {version.author_name}
        </div>
      )}
      {version.message && (
        <p className="mt-1 text-[10px] text-[#3d5670] truncate">{version.message}</p>
      )}
    </button>
  );
}

function VersionDetail({
  version,
  onRestore,
}: {
  version: FlowVersion;
  onRestore?: (version: FlowVersion) => void;
}) {
  return (
    <div className="space-y-4 p-1">
      <div>
        <h5 className="text-xs font-semibold text-[#c8dce8]">Version {version.version}</h5>
        <div className="mt-2 space-y-1 text-xs text-[#4a6480]">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {new Date(version.created_at).toLocaleString()}
          </div>
          {version.author_name && (
            <div className="flex items-center gap-1.5">
              <User className="h-3 w-3" />
              {version.author_name}
            </div>
          )}
        </div>
      </div>

      {version.message && (
        <div>
          <h6 className="text-xs font-semibold text-[#c8dce8]">Message</h6>
          <p className="mt-1 text-xs text-[#4a6480]">{version.message}</p>
        </div>
      )}

      {version.description && (
        <div>
          <h6 className="text-xs font-semibold text-[#c8dce8]">Description</h6>
          <p className="mt-1 text-xs text-[#4a6480]">{version.description}</p>
        </div>
      )}

      <div className="h-px bg-[#1a2332]" />

      <div>
        <h6 className="text-xs font-semibold text-[#c8dce8] mb-2">Content</h6>
        <pre className="p-2 bg-[#0b0f18] border border-[#1e2d3d] rounded-lg text-[10px] overflow-x-auto max-h-[200px] font-mono text-[#7fa8c8]">
          <code>{version.content}</code>
        </pre>
      </div>

      {onRestore && (
        <>
          <div className="h-px bg-[#1a2332]" />
          <button
            onClick={() => onRestore(version)}
            className="w-full h-8 rounded-lg text-xs border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
          >
            Restore this version
          </button>
        </>
      )}
    </div>
  );
}

function VersionComparison({ v1, v2 }: { v1: FlowVersion; v2: FlowVersion }) {
  const lines1 = v1.content.split('\n');
  const lines2 = v2.content.split('\n');

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between text-xs">
        <span className="px-2 py-0.5 rounded border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8]">v{v1.version}</span>
        <ChevronRight className="h-3.5 w-3.5 text-[#3d5670]" />
        <span className="px-2 py-0.5 rounded border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8]">v{v2.version}</span>
      </div>

      <div className="text-[10px] flex items-center gap-3 text-[#4a6480]">
        <span className="text-green-400">+ Added</span>
        <span className="text-red-400">- Removed</span>
      </div>

      <div className="h-px bg-[#1a2332]" />

      <div className="space-y-1 font-mono text-xs">
        <div className="p-2 bg-[#0b0f18] border border-[#1e2d3d] rounded-lg max-h-[250px] overflow-auto">
          {lines2.map((line, i) => {
            const oldLine = lines1[i];
            const isNew = !oldLine;
            const isChanged = oldLine && oldLine !== line;

            return (
              <div
                key={i}
                className={cn(
                  'px-1 text-[#7fa8c8]',
                  isNew && 'bg-green-400/10 text-green-400',
                  isChanged && 'bg-yellow-400/10 text-yellow-400'
                )}
              >
                {line || ' '}
              </div>
            );
          })}
          {lines1.slice(lines2.length).map((line, i) => (
            <div
              key={`removed-${i}`}
              className="px-1 bg-red-400/10 text-red-400 line-through"
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-[#4a6480]">
        <p>v{v1.version}: {v1.author_name || 'Unknown'}</p>
        <p>v{v2.version}: {v2.author_name || 'Unknown'}</p>
      </div>
    </div>
  );
}

export function VersionDropdown({
  flowId,
  currentVersion,
  onVersionSelect,
}: {
  flowId: string;
  currentVersion?: number;
  onVersionSelect: (version: number) => void;
}) {
  const { data: versionsData, isLoading } = useFlowVersions(flowId, 20);
  const versions = versionsData?.versions || [];

  if (isLoading || versions.length === 0) return null;

  return (
    <Select
      value={currentVersion?.toString()}
      onValueChange={(value) => onVersionSelect(parseInt(value))}
    >
      <SelectTrigger className="w-[120px]">
        <SelectValue placeholder="Version" />
      </SelectTrigger>
      <SelectContent>
        {versions.map((version) => (
          <SelectItem key={version.id} value={version.version.toString()}>
            v{version.version}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
