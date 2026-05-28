'use client';

import { useState, useMemo } from 'react';
import { Search, FileText, Loader2, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useFlows } from '@/lib/hooks/useFlows';
import type { Flow, CollectionTreeNode } from '@/lib/api/types';

interface AddFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  collectionName: string;
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
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a6480]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search flows by name, suite, or tags..."
              className="pl-8"
            />
          </div>

          <div className="max-h-[300px] overflow-auto border border-[#1e2d3d] rounded-lg bg-[#0f1923]">
            {isLoadingFlows ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#4a6480]" />
              </div>
            ) : availableFlows.length === 0 ? (
              <div className="text-center text-xs text-[#4a6480] py-8">
                {searchQuery ? 'No matching flows found' : 'All flows are already in this collection'}
              </div>
            ) : (
              <div className="divide-y divide-[#1a2332]">
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
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="flex items-center h-8 px-4 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedFlowId || isLoading}
            className="flex items-center h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Adding...' : 'Add Flow'}
          </button>
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
        'hover:bg-[#131b26]',
        isSelected && 'bg-teal-400/5'
      )}
      onClick={onSelect}
    >
      <div
        className={cn(
          'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
          isSelected ? 'border-teal-400 bg-teal-400/20' : 'border-[#2a3d52]'
        )}
      >
        {isSelected && <Check className="w-2.5 h-2.5 text-teal-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-[#4a6480] shrink-0" />
          <span className="font-medium text-xs text-[#c8dce8] truncate">{flow.name}</span>
        </div>

        {flow.description && (
          <p className="text-[10px] text-[#4a6480] mt-0.5 line-clamp-1">{flow.description}</p>
        )}

        <div className="flex items-center gap-1.5 mt-1">
          {flow.suite && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#1e2d3d] text-[#7fa8c8]">
              {flow.suite}
            </span>
          )}
          {flow.tags?.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2332] text-[#4a6480]">
              {tag}
            </span>
          ))}
          {flow.tags && flow.tags.length > 3 && (
            <span className="text-[10px] text-[#4a6480]">+{flow.tags.length - 3} more</span>
          )}
        </div>
      </div>
    </div>
  );
}
