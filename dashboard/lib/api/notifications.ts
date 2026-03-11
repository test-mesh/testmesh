import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016';

const api = axios.create({ baseURL: API_BASE_URL });

export interface Notification {
  id: string;
  workspace_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ListNotificationsResponse {
  notifications: Notification[];
  unread_count: number;
}

export const notificationsApi = {
  list: (workspaceId: string, params?: { limit?: number; offset?: number }): Promise<ListNotificationsResponse> =>
    api.get(`/api/v1/workspaces/${workspaceId}/notifications`, { params }).then(r => r.data),

  markRead: (workspaceId: string, id: string): Promise<void> =>
    api.patch(`/api/v1/workspaces/${workspaceId}/notifications/${id}/read`).then(() => undefined),

  markAllRead: (workspaceId: string): Promise<void> =>
    api.patch(`/api/v1/workspaces/${workspaceId}/notifications/read-all`).then(() => undefined),

  delete: (workspaceId: string, id: string): Promise<void> =>
    api.delete(`/api/v1/workspaces/${workspaceId}/notifications/${id}`).then(() => undefined),
};
