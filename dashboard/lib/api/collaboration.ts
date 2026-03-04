import { apiClient } from './client';

// Types
export interface UserPresence {
  id: string;
  user_id: string;
  user_name: string;
  user_email?: string;
  user_avatar?: string;
  color: string;
  resource_type: string;
  resource_id: string;
  status: 'viewing' | 'editing';
  cursor_data?: string;
  last_active_at: string;
  connected_at: string;
}

export interface FlowComment {
  id: string;
  flow_id: string;
  step_id?: string;
  parent_id?: string;
  author_id: string;
  author_name: string;
  author_avatar?: string;
  content: string;
  resolved: boolean;
  position?: Record<string, any>;
  created_at: string;
  updated_at: string;
  replies?: FlowComment[];
}

export interface ActivityEvent {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_avatar?: string;
  event_type: string;
  resource_type: string;
  resource_id: string;
  resource_name?: string;
  description?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  workspace_id?: string;
  created_at: string;
}

export interface FlowVersion {
  id: string;
  flow_id: string;
  version: number;
  content: string;
  author_id: string;
  author_name?: string;
  message?: string;
  description?: string;
  created_at: string;
}

// Presence types
export interface SetPresenceRequest {
  user_id: string;
  user_name: string;
  user_email?: string;
  user_avatar?: string;
  resource_type: string;
  resource_id: string;
  status?: 'viewing' | 'editing';
  cursor_data?: string;
}

// Comment types
export interface CreateCommentRequest {
  flow_id: string;
  step_id?: string;
  parent_id?: string;
  author_id: string;
  author_name: string;
  author_avatar?: string;
  content: string;
  position?: Record<string, any>;
}

// Activity params
export interface ActivityParams {
  workspace_id?: string;
  resource_type?: string;
  resource_id?: string;
  actor_id?: string;
  event_type?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

// Presence API
export async function setPresence(data: SetPresenceRequest): Promise<UserPresence> {
  const response = await apiClient.post('/api/v1/collaboration/presence', data);
  return response.data;
}

export async function removePresence(
  userId: string,
  resourceType: string,
  resourceId: string
): Promise<void> {
  await apiClient.delete('/api/v1/collaboration/presence', {
    params: { user_id: userId, resource_type: resourceType, resource_id: resourceId },
  });
}

export async function getPresence(
  resourceType: string,
  resourceId: string
): Promise<{ presences: UserPresence[]; count: number }> {
  const response = await apiClient.get(
    `/api/v1/collaboration/presence/${resourceType}/${resourceId}`
  );
  return response.data;
}

// Comments API
export async function createComment(data: CreateCommentRequest): Promise<FlowComment> {
  const response = await apiClient.post('/api/v1/collaboration/comments', data);
  return response.data;
}

export async function getComment(id: string): Promise<FlowComment> {
  const response = await apiClient.get(`/api/v1/collaboration/comments/${id}`);
  return response.data;
}

export async function updateComment(id: string, content: string): Promise<FlowComment> {
  const response = await apiClient.put(`/api/v1/collaboration/comments/${id}`, { content });
  return response.data;
}

export async function deleteComment(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/collaboration/comments/${id}`);
}

export async function resolveComment(id: string): Promise<void> {
  await apiClient.post(`/api/v1/collaboration/comments/${id}/resolve`);
}

export async function unresolveComment(id: string): Promise<void> {
  await apiClient.post(`/api/v1/collaboration/comments/${id}/unresolve`);
}

export async function getFlowComments(
  flowId: string,
  includeResolved?: boolean
): Promise<{ comments: FlowComment[]; count: number }> {
  const response = await apiClient.get(`/api/v1/collaboration/flows/${flowId}/comments`, {
    params: { include_resolved: includeResolved },
  });
  return response.data;
}

// Activity API
export async function getActivity(
  params?: ActivityParams
): Promise<{ events: ActivityEvent[]; total: number }> {
  const response = await apiClient.get('/api/v1/collaboration/activity', { params });
  return response.data;
}

// Flow Versions API
export async function getFlowVersions(
  flowId: string,
  limit?: number
): Promise<{ versions: FlowVersion[]; count: number }> {
  const response = await apiClient.get(`/api/v1/collaboration/flows/${flowId}/versions`, {
    params: { limit },
  });
  return response.data;
}

export async function getFlowVersion(flowId: string, version: number): Promise<FlowVersion> {
  const response = await apiClient.get(
    `/api/v1/collaboration/flows/${flowId}/versions/${version}`
  );
  return response.data;
}

export async function compareFlowVersions(
  flowId: string,
  v1: number,
  v2: number
): Promise<{ version1: FlowVersion; version2: FlowVersion }> {
  const response = await apiClient.get(
    `/api/v1/collaboration/flows/${flowId}/versions/compare`,
    { params: { v1, v2 } }
  );
  return response.data;
}

// Event type constants
export const EventTypes = {
  FLOW_CREATED: 'flow.created',
  FLOW_UPDATED: 'flow.updated',
  FLOW_DELETED: 'flow.deleted',
  EXECUTION_STARTED: 'execution.started',
  EXECUTION_COMPLETED: 'execution.completed',
  EXECUTION_FAILED: 'execution.failed',
  COMMENT_ADDED: 'comment.added',
  COMMENT_RESOLVED: 'comment.resolved',
  COLLECTION_CREATED: 'collection.created',
  COLLECTION_UPDATED: 'collection.updated',
  MEMBER_JOINED: 'member.joined',
  MEMBER_LEFT: 'member.left',
} as const;

// Helper to get user-friendly event description
export function getEventDescription(event: ActivityEvent): string {
  const actor = event.actor_name;
  const resource = event.resource_name || event.resource_type;

  switch (event.event_type) {
    case EventTypes.FLOW_CREATED:
      return `${actor} created flow "${resource}"`;
    case EventTypes.FLOW_UPDATED:
      return `${actor} updated flow "${resource}"`;
    case EventTypes.FLOW_DELETED:
      return `${actor} deleted flow "${resource}"`;
    case EventTypes.EXECUTION_STARTED:
      return `${actor} started execution for "${resource}"`;
    case EventTypes.EXECUTION_COMPLETED:
      return `Execution completed for "${resource}"`;
    case EventTypes.EXECUTION_FAILED:
      return `Execution failed for "${resource}"`;
    case EventTypes.COMMENT_ADDED:
      return `${actor} commented on "${resource}"`;
    case EventTypes.COMMENT_RESOLVED:
      return `${actor} resolved a comment on "${resource}"`;
    case EventTypes.COLLECTION_CREATED:
      return `${actor} created collection "${resource}"`;
    case EventTypes.COLLECTION_UPDATED:
      return `${actor} updated collection "${resource}"`;
    case EventTypes.MEMBER_JOINED:
      return `${actor} joined the workspace`;
    case EventTypes.MEMBER_LEFT:
      return `${actor} left the workspace`;
    default:
      return event.description || `${actor} performed ${event.event_type}`;
  }
}

// Helper to get event icon
export function getEventIcon(eventType: string): string {
  switch (eventType) {
    case EventTypes.FLOW_CREATED:
    case EventTypes.COLLECTION_CREATED:
      return '➕';
    case EventTypes.FLOW_UPDATED:
    case EventTypes.COLLECTION_UPDATED:
      return '✏️';
    case EventTypes.FLOW_DELETED:
      return '🗑️';
    case EventTypes.EXECUTION_STARTED:
      return '▶️';
    case EventTypes.EXECUTION_COMPLETED:
      return '✅';
    case EventTypes.EXECUTION_FAILED:
      return '❌';
    case EventTypes.COMMENT_ADDED:
      return '💬';
    case EventTypes.COMMENT_RESOLVED:
      return '✔️';
    case EventTypes.MEMBER_JOINED:
      return '👋';
    case EventTypes.MEMBER_LEFT:
      return '👋';
    default:
      return '📌';
  }
}
