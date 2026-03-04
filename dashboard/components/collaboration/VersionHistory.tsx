'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Separator } from '@/components/ui/separator';
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
        <Button variant="outline" size="sm" className={className}>
          <History className="h-4 w-4 mr-2" />
          Version History
          {versions.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {versions.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </SheetTitle>
          <SheetDescription>
            Browse and compare previous versions of this flow
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Compare Mode Toggle */}
          <div className="flex items-center justify-between">
            <Button
              variant={isComparing ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setIsComparing(!isComparing);
                setCompareVersion(null);
              }}
            >
              <GitCompare className="h-4 w-4 mr-2" />
              {isComparing ? 'Comparing' : 'Compare Versions'}
            </Button>
            {isComparing && selectedVersion && (
              <span className="text-sm text-muted-foreground">
                Select another version to compare
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Version List */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Versions</h4>
              <ScrollArea className="h-[400px] rounded-md border p-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : versions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No version history</p>
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
              <h4 className="text-sm font-medium">
                {isComparing && compareVersion ? 'Comparison' : 'Details'}
              </h4>
              <ScrollArea className="h-[400px] rounded-md border p-2">
                {isComparing && selectedVersion && compareVersion ? (
                  // Comparison View
                  comparisonLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : comparisonData ? (
                    <VersionComparison
                      v1={comparisonData.version1}
                      v2={comparisonData.version2}
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">Select two versions to compare</p>
                    </div>
                  )
                ) : selectedVersion && versionDetail ? (
                  // Single Version Detail
                  detailLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <VersionDetail
                      version={versionDetail}
                      onRestore={onRestore}
                    />
                  )
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Select a version to view details</p>
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
        'w-full text-left p-2 rounded-md transition-colors',
        'hover:bg-muted',
        isSelected && 'bg-primary/10 border border-primary',
        isCompareTarget && 'bg-blue-500/10 border border-blue-500'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">v{version.version}</span>
        {(isSelected || isCompareTarget) && (
          <Badge variant={isSelected ? 'default' : 'secondary'} className="text-xs">
            {isSelected ? 'Selected' : 'Compare'}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
      </div>
      {version.author_name && (
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <User className="h-3 w-3" />
          {version.author_name}
        </div>
      )}
      {version.message && (
        <p className="mt-1 text-xs text-muted-foreground truncate">{version.message}</p>
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
    <div className="space-y-4">
      <div>
        <h5 className="font-medium">Version {version.version}</h5>
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            {new Date(version.created_at).toLocaleString()}
          </div>
          {version.author_name && (
            <div className="flex items-center gap-2">
              <User className="h-3 w-3" />
              {version.author_name}
            </div>
          )}
        </div>
      </div>

      {version.message && (
        <div>
          <h6 className="text-sm font-medium">Message</h6>
          <p className="mt-1 text-sm text-muted-foreground">{version.message}</p>
        </div>
      )}

      {version.description && (
        <div>
          <h6 className="text-sm font-medium">Description</h6>
          <p className="mt-1 text-sm text-muted-foreground">{version.description}</p>
        </div>
      )}

      <Separator />

      <div>
        <h6 className="text-sm font-medium mb-2">Content</h6>
        <pre className="p-2 bg-muted rounded-md text-xs overflow-x-auto max-h-[200px]">
          <code>{version.content}</code>
        </pre>
      </div>

      {onRestore && (
        <>
          <Separator />
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onRestore(version)}
          >
            Restore this version
          </Button>
        </>
      )}
    </div>
  );
}

function VersionComparison({
  v1,
  v2,
}: {
  v1: FlowVersion;
  v2: FlowVersion;
}) {
  // Simple line-by-line diff visualization
  const lines1 = v1.content.split('\n');
  const lines2 = v2.content.split('\n');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <Badge variant="outline">v{v1.version}</Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <Badge variant="outline">v{v2.version}</Badge>
      </div>

      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-green-600">+ Added</span>
          <span className="text-red-600">- Removed</span>
        </div>
      </div>

      <Separator />

      <div className="space-y-1 font-mono text-xs">
        {/* Very simple diff - in production you'd use a proper diff library */}
        <div className="p-2 bg-muted rounded-md max-h-[250px] overflow-auto">
          {lines2.map((line, i) => {
            const oldLine = lines1[i];
            const isNew = !oldLine;
            const isChanged = oldLine && oldLine !== line;
            const isRemoved = i >= lines2.length && lines1[i];

            return (
              <div
                key={i}
                className={cn(
                  'px-1',
                  isNew && 'bg-green-500/20 text-green-700 dark:text-green-300',
                  isChanged && 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
                )}
              >
                {line || ' '}
              </div>
            );
          })}
          {lines1.slice(lines2.length).map((line, i) => (
            <div
              key={`removed-${i}`}
              className="px-1 bg-red-500/20 text-red-700 dark:text-red-300 line-through"
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>v{v1.version}: {v1.author_name || 'Unknown'}</p>
        <p>v{v2.version}: {v2.author_name || 'Unknown'}</p>
      </div>
    </div>
  );
}

// Dropdown version for compact display
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

  if (isLoading || versions.length === 0) {
    return null;
  }

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
