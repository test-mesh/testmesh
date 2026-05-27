'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FolderTree, Search, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CollectionTree, CollectionDialog, MoveCollectionDialog, AddFlowDialog } from '@/components/collections';
import {
  useCollectionTree,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
  useDuplicateCollection,
  useMoveCollection,
  useRemoveFlowFromCollection,
  useAddFlowToCollection,
  useCollection,
} from '@/lib/hooks/useCollections';
import type { CollectionTreeNode, CreateCollectionRequest, UpdateCollectionRequest } from '@/lib/api/types';

function filterTree(nodes: CollectionTreeNode[], query: string): CollectionTreeNode[] {
  if (!query.trim()) return nodes;
  const lowerQuery = query.toLowerCase();
  return nodes.reduce<CollectionTreeNode[]>((acc, node) => {
    const nodeMatches = node.name.toLowerCase().includes(lowerQuery) || node.description?.toLowerCase().includes(lowerQuery);
    const filteredChildren = node.children ? filterTree(node.children, query) : undefined;
    const hasMatchingChildren = filteredChildren && filteredChildren.length > 0;
    if (nodeMatches || hasMatchingChildren) acc.push({ ...node, children: filteredChildren });
    return acc;
  }, []);
}

function collectFlowIds(node: CollectionTreeNode): string[] {
  const flowIds: string[] = [];
  if (node.type === 'flow' && node.flow_id) flowIds.push(node.flow_id);
  if (node.children) for (const child of node.children) flowIds.push(...collectFlowIds(child));
  return flowIds;
}

function findParentCollectionId(nodes: CollectionTreeNode[], flowId: string, parentId?: string): string | null {
  for (const node of nodes) {
    if (node.type === 'flow' && node.flow_id === flowId) return parentId || null;
    if (node.children) {
      const found = findParentCollectionId(node.children, flowId, node.id);
      if (found) return found;
    }
  }
  return null;
}

export default function CollectionsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [parentIdForCreate, setParentIdForCreate] = useState<string | undefined>();

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveCollectionId, setMoveCollectionId] = useState<string | null>(null);
  const [moveCollectionName, setMoveCollectionName] = useState('');

  const [addFlowDialogOpen, setAddFlowDialogOpen] = useState(false);
  const [addFlowCollectionId, setAddFlowCollectionId] = useState<string | null>(null);
  const [addFlowCollectionName, setAddFlowCollectionName] = useState('');
  const [existingFlowIds, setExistingFlowIds] = useState<string[]>([]);

  const [removeFlowDialogOpen, setRemoveFlowDialogOpen] = useState(false);
  const [removeFlowId, setRemoveFlowId] = useState<string | null>(null);
  const [removeFlowCollectionId, setRemoveFlowCollectionId] = useState<string | null>(null);

  const { data: treeData, isLoading } = useCollectionTree();
  const { data: editingCollection } = useCollection(editingCollectionId || '');

  const createCollection = useCreateCollection();
  const updateCollection = useUpdateCollection();
  const deleteCollection = useDeleteCollection();
  const duplicateCollection = useDuplicateCollection();
  const moveCollection = useMoveCollection();
  const removeFlowFromCollection = useRemoveFlowFromCollection();
  const addFlowToCollection = useAddFlowToCollection();

  const handleSelect = (node: CollectionTreeNode) => setSelectedNodeId(node.id);

  const handleCreateCollection = (parentId?: string) => {
    setEditingCollectionId(null);
    setParentIdForCreate(parentId);
    setDialogOpen(true);
  };

  const handleEditCollection = (id: string) => {
    setEditingCollectionId(id);
    setParentIdForCreate(undefined);
    setDialogOpen(true);
  };

  const handleDeleteCollection = async (id: string) => {
    if (confirm('Are you sure you want to delete this collection?')) {
      await deleteCollection.mutateAsync(id);
    }
  };

  const handleDuplicateCollection = async (id: string) => {
    const name = prompt('Enter name for the duplicate:');
    if (name) await duplicateCollection.mutateAsync({ id, name });
  };

  const handleMoveCollection = (id: string) => {
    const findNode = (nodes: CollectionTreeNode[]): CollectionTreeNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) { const found = findNode(node.children); if (found) return found; }
      }
      return null;
    };
    const node = findNode(treeData?.tree || []);
    if (node) { setMoveCollectionId(id); setMoveCollectionName(node.name); setMoveDialogOpen(true); }
  };

  const handleMoveSubmit = async (targetParentId: string | null) => {
    if (!moveCollectionId) return;
    await moveCollection.mutateAsync({ id: moveCollectionId, data: { parent_id: targetParentId } });
  };

  const handleRunFlow = (flowId: string) => router.push(`/flows/${flowId}/run`);
  const handleEditFlow = (flowId: string) => router.push(`/flows/${flowId}/edit`);

  const handleDeleteFlow = async (flowId: string) => {
    const collectionId = findParentCollectionId(treeData?.tree || [], flowId);
    if (collectionId) {
      setRemoveFlowId(flowId);
      setRemoveFlowCollectionId(collectionId);
      setRemoveFlowDialogOpen(true);
    }
  };

  const handleConfirmRemoveFlow = async () => {
    if (removeFlowId && removeFlowCollectionId) {
      await removeFlowFromCollection.mutateAsync({ collectionId: removeFlowCollectionId, flowId: removeFlowId });
      setRemoveFlowDialogOpen(false);
      setRemoveFlowId(null);
      setRemoveFlowCollectionId(null);
    }
  };

  const handleAddFlow = (collectionId: string, collectionName: string, node: CollectionTreeNode) => {
    setAddFlowCollectionId(collectionId);
    setAddFlowCollectionName(collectionName);
    setExistingFlowIds(collectFlowIds(node));
    setAddFlowDialogOpen(true);
  };

  const handleAddFlowSubmit = async (flowId: string) => {
    if (!addFlowCollectionId) return;
    await addFlowToCollection.mutateAsync({ collectionId: addFlowCollectionId, data: { flow_id: flowId } });
  };

  const handleDialogSubmit = async (data: CreateCollectionRequest | UpdateCollectionRequest) => {
    if (editingCollectionId) await updateCollection.mutateAsync({ id: editingCollectionId, data });
    else await createCollection.mutateAsync(data as CreateCollectionRequest);
  };

  const filteredTree = useMemo(() => filterTree(treeData?.tree || [], searchQuery), [treeData?.tree, searchQuery]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <div className="w-72 border-r border-[#1e2d3d] flex flex-col bg-[#0b0f18]">
        <div className="p-3 border-b border-[#1e2d3d] space-y-2">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-[#3d5670]" />
            <h2 className="text-[13px] font-semibold text-[#c8dce8]">Collections</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#3d5670]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search collections..."
              className="w-full h-7 pl-7 pr-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[#3d5670]" />
          </div>
        ) : (
          <CollectionTree
            tree={filteredTree}
            selectedId={selectedNodeId}
            onSelect={handleSelect}
            onCreateCollection={handleCreateCollection}
            onEditCollection={handleEditCollection}
            onDeleteCollection={handleDeleteCollection}
            onDuplicateCollection={handleDuplicateCollection}
            onMoveCollection={handleMoveCollection}
            onRunFlow={handleRunFlow}
            onEditFlow={handleEditFlow}
            onDeleteFlow={handleDeleteFlow}
            className="flex-1"
          />
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 p-6 overflow-auto bg-[#0b0f18]">
        {selectedNodeId ? (
          <SelectedNodeDetails
            nodeId={selectedNodeId}
            tree={filteredTree}
            onEdit={handleEditCollection}
            onDelete={handleDeleteCollection}
            onAddFlow={handleAddFlow}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FolderTree className="w-12 h-12 text-[#1e2d3d] mb-4" />
            <h3 className="text-[13px] font-semibold text-[#c8dce8] mb-1">Organize Your Flows</h3>
            <p className="text-[11px] text-[#4a6480] mb-5 max-w-md">
              Collections help you organize your test flows into logical groups.
              Create nested folders, set collection-level variables, and manage authentication
              settings that apply to all flows within.
            </p>
            <button
              onClick={() => handleCreateCollection()}
              className="flex items-center gap-1.5 h-7 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
            >
              <Plus className="w-3 h-3" />Create Collection
            </button>
          </div>
        )}
      </div>

      <CollectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        collection={editingCollection || null}
        parentId={parentIdForCreate}
        onSubmit={handleDialogSubmit}
        isLoading={createCollection.isPending || updateCollection.isPending}
      />

      <MoveCollectionDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        collectionId={moveCollectionId || ''}
        collectionName={moveCollectionName}
        tree={treeData?.tree || []}
        onMove={handleMoveSubmit}
        isLoading={moveCollection.isPending}
      />

      <AddFlowDialog
        open={addFlowDialogOpen}
        onOpenChange={setAddFlowDialogOpen}
        collectionId={addFlowCollectionId || ''}
        collectionName={addFlowCollectionName}
        existingFlowIds={existingFlowIds}
        onAddFlow={handleAddFlowSubmit}
        isLoading={addFlowToCollection.isPending}
      />

      <AlertDialog open={removeFlowDialogOpen} onOpenChange={setRemoveFlowDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Flow from Collection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this flow from the collection? The flow itself will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemoveFlow} disabled={removeFlowFromCollection.isPending}>
              {removeFlowFromCollection.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SelectedNodeDetails({
  nodeId, tree, onEdit, onDelete, onAddFlow,
}: {
  nodeId: string;
  tree: CollectionTreeNode[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAddFlow: (collectionId: string, collectionName: string, node: CollectionTreeNode) => void;
}) {
  const findNode = (nodes: CollectionTreeNode[], id: string): CollectionTreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) { const found = findNode(node.children, id); if (found) return found; }
    }
    return null;
  };

  const node = findNode(tree, nodeId);

  if (!node) {
    return <div className="text-xs text-[#4a6480]">Collection not found</div>;
  }

  if (node.type === 'flow') {
    return (
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
        <p className="text-[13px] font-semibold text-[#c8dce8] mb-0.5">{node.name}</p>
        <p className="text-[10px] text-[#4a6480]">Test Flow — click &ldquo;Edit Flow&rdquo; in the tree to view and modify.</p>
      </div>
    );
  }

  const childCollections = node.children?.filter((c) => c.type === 'collection') || [];
  const childFlows = node.children?.filter((c) => c.type === 'flow') || [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2332]">
          <div className="flex items-center gap-2">
            {node.icon && <span className="text-xl">{node.icon}</span>}
            <div>
              <p className="text-[13px] font-semibold text-[#c8dce8]">{node.name}</p>
              {node.description && <p className="text-[11px] text-[#4a6480]">{node.description}</p>}
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => onEdit(node.id)}
              className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onAddFlow(node.id, node.name, node)}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
            >
              <Plus className="h-3 w-3" />Add Flow
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 px-4 py-3 gap-4">
          <div>
            <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Sub-collections</span>
            <p className="text-[13px] font-semibold text-[#c8dce8] mt-0.5">{childCollections.length}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Flows</span>
            <p className="text-[13px] font-semibold text-[#c8dce8] mt-0.5">{childFlows.length}</p>
          </div>
        </div>
      </div>

      {childFlows.length > 0 && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Flows in this Collection</span>
          </div>
          <div className="divide-y divide-[#1a2332]">
            {childFlows.map((flow) => (
              <div key={flow.id} className="flex items-center px-4 py-2.5 hover:bg-[#131b26] transition-colors">
                <span className="text-[12px] text-[#c8dce8]">{flow.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
