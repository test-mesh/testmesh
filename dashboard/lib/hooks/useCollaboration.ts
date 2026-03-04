import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';
import {
  getPresence,
  setPresence,
  removePresence,
  getFlowComments,
  createComment,
  updateComment,
  deleteComment,
  resolveComment,
  unresolveComment,
  getActivity,
  getFlowVersions,
  getFlowVersion,
  compareFlowVersions,
  type UserPresence,
  type SetPresenceRequest,
  type CreateCommentRequest,
  type ActivityParams,
} from '../api/collaboration';

// Query keys
export const collaborationKeys = {
  all: ['collaboration'] as const,
  presence: (resourceType: string, resourceId: string) =>
    [...collaborationKeys.all, 'presence', resourceType, resourceId] as const,
  comments: (flowId: string) => [...collaborationKeys.all, 'comments', flowId] as const,
  activity: (params?: ActivityParams) => [...collaborationKeys.all, 'activity', params] as const,
  versions: (flowId: string) => [...collaborationKeys.all, 'versions', flowId] as const,
  version: (flowId: string, version: number) =>
    [...collaborationKeys.versions(flowId), version] as const,
};

// Presence hooks
export function usePresence(resourceType: string, resourceId: string) {
  return useQuery({
    queryKey: collaborationKeys.presence(resourceType, resourceId),
    queryFn: () => getPresence(resourceType, resourceId),
    enabled: !!resourceType && !!resourceId,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

export function useSetPresence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SetPresenceRequest) => setPresence(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.presence(variables.resource_type, variables.resource_id),
      });
    },
  });
}

export function useRemovePresence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      resourceType,
      resourceId,
    }: {
      userId: string;
      resourceType: string;
      resourceId: string;
    }) => removePresence(userId, resourceType, resourceId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.presence(variables.resourceType, variables.resourceId),
      });
    },
  });
}

// Hook to manage presence for current user
export function useUserPresence(
  userId: string,
  userName: string,
  resourceType: string,
  resourceId: string,
  options?: {
    userEmail?: string;
    userAvatar?: string;
    heartbeatInterval?: number;
  }
) {
  const setPresenceMutation = useSetPresence();
  const removePresenceMutation = useRemovePresence();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const updatePresence = useCallback(
    (status: 'viewing' | 'editing' = 'viewing', cursorData?: string) => {
      setPresenceMutation.mutate({
        user_id: userId,
        user_name: userName,
        user_email: options?.userEmail,
        user_avatar: options?.userAvatar,
        resource_type: resourceType,
        resource_id: resourceId,
        status,
        cursor_data: cursorData,
      });
    },
    [userId, userName, resourceType, resourceId, options, setPresenceMutation]
  );

  // Set up heartbeat
  useEffect(() => {
    if (!userId || !resourceId) return;

    // Initial presence
    updatePresence('viewing');

    // Heartbeat
    const interval = options?.heartbeatInterval || 30000; // 30 seconds default
    intervalRef.current = setInterval(() => {
      updatePresence('viewing');
    }, interval);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      removePresenceMutation.mutate({
        userId,
        resourceType,
        resourceId,
      });
    };
  }, [userId, resourceId, resourceType]);

  return {
    setEditing: () => updatePresence('editing'),
    setViewing: () => updatePresence('viewing'),
    updateCursor: (cursorData: string) => updatePresence('editing', cursorData),
  };
}

// Comment hooks
export function useFlowComments(flowId: string, includeResolved?: boolean) {
  return useQuery({
    queryKey: collaborationKeys.comments(flowId),
    queryFn: () => getFlowComments(flowId, includeResolved),
    enabled: !!flowId,
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCommentRequest) => createComment(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.comments(variables.flow_id),
      });
    },
  });
}

export function useUpdateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, content, flowId }: { id: string; content: string; flowId: string }) =>
      updateComment(id, content),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.comments(variables.flowId),
      });
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, flowId }: { id: string; flowId: string }) => deleteComment(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.comments(variables.flowId),
      });
    },
  });
}

export function useResolveComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, flowId }: { id: string; flowId: string }) => resolveComment(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.comments(variables.flowId),
      });
    },
  });
}

export function useUnresolveComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, flowId }: { id: string; flowId: string }) => unresolveComment(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.comments(variables.flowId),
      });
    },
  });
}

// Activity hooks
export function useActivity(params?: ActivityParams) {
  return useQuery({
    queryKey: collaborationKeys.activity(params),
    queryFn: () => getActivity(params),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Version hooks
export function useFlowVersions(flowId: string, limit?: number) {
  return useQuery({
    queryKey: collaborationKeys.versions(flowId),
    queryFn: () => getFlowVersions(flowId, limit),
    enabled: !!flowId,
  });
}

export function useFlowVersion(flowId: string, version: number) {
  return useQuery({
    queryKey: collaborationKeys.version(flowId, version),
    queryFn: () => getFlowVersion(flowId, version),
    enabled: !!flowId && version > 0,
  });
}

export function useCompareFlowVersions(flowId: string, v1: number, v2: number) {
  return useQuery({
    queryKey: [...collaborationKeys.versions(flowId), 'compare', v1, v2],
    queryFn: () => compareFlowVersions(flowId, v1, v2),
    enabled: !!flowId && v1 > 0 && v2 > 0 && v1 !== v2,
  });
}
