'use client';

import { useState, useMemo } from 'react';
import { Search, FileText, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFlows } from '@/lib/hooks/useFlows';
import type { Flow, CollectionTreeNode } from '@/lib/api/types';

interface AddFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  collectionName: string;
  /** Current flows already in this collection (to exclude from list) */
  existingFlowIds: string[];
  onAddFlow: (flowId: string) => Promise<void>;
  isLoading?: boolean;
}

export default function AddFlowDialog({
  open,
  onOpenChange,
  collectionId,
  collectionName,
  existingFlowIds,
  onAddFlow,
  isLoading,
}: AddFlowDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);

  const { data: flowsData, isLoading: isLoadingFlows } = useFlows();

  // Filter out flows already in the collection and apply search
  const availableFlows = useMemo(() => {
    if (!flowsData?.flows) return [];

    const existingSet = new Set(existingFlowIds);
    return flowsData.flows
      .filter((flow) => !existingSet.has(flow.id))
      .filter((flow) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          flow.name.toLowerCase().includes(query) ||
          flow.description?.toLowerCase().includes(query) ||
          flow.suite?.toLowerCase().includes(query) ||
          flow.tags?.some((tag) => tag.toLowerCase().includes(query))
        );
      });
  }, [flowsData?.flows, existingFlowIds, searchQuery]);

  const handleSubmit = async () => {
    if (!selectedFlowId) return;
    await onAddFlow(selectedFlowId);
    setSelectedFlowId(null);
    setSearchQuery('');
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedFlowId(null);
      setSearchQuery('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Flow to Collection</DialogTitle>
          <DialogDescription>
            Select a flow to add to &quot;{collectionName}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search flows by name, suite, or tags..."
              className="pl-8"
            />
          </div>

          {/* Flows list */}
          <div className="max-h-[300px] overflow-auto border rounded-md">
            {isLoadingFlows ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : availableFlows.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                {searchQuery
                  ? 'No matching flows found'
                  : 'All flows are already in this collection'}
              </div>
            ) : (
              <div className="divide-y">
                {availableFlows.map((flow) => (
                  <FlowListItem
                    key={flow.id}
                    flow={flow}
                    isSelected={selectedFlowId === flow.id}
                    onSelect={() => setSelectedFlowId(flow.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedFlowId || isLoading}>
            {isLoading ? 'Adding...' : 'Add Flow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FlowListItemProps {
  flow: Flow;
  isSelected: boolean;
  onSelect: () => void;
}

function FlowListItem({ flow, isSelected, onSelect }: FlowListItemProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 cursor-pointer transition-colors',
        'hover:bg-muted/50',
        isSelected && 'bg-primary/10'
      )}
      onClick={onSelect}
    >
      <div
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
          isSelected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/30'
        )}
      >
        {isSelected && <Check className="w-3 h-3" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{flow.name}</span>
        </div>

        {flow.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {flow.description}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          {flow.suite && (
            <Badge variant="outline" className="text-xs">
              {flow.suite}
            </Badge>
          )}
          {flow.tags?.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {flow.tags && flow.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{flow.tags.length - 3} more
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
