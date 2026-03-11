'use client';

import { useState, useEffect, useCallback } from 'react';
import { notificationsApi, type Notification } from '@/lib/api/notifications';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';

const POLL_INTERVAL_MS = 30_000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const workspaceId = getActiveWorkspaceId();

  const fetchNotifications = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await notificationsApi.list(workspaceId);
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, [workspaceId]);

  // Initial fetch + polling
  useEffect(() => {
    setLoading(true);
    fetchNotifications().finally(() => setLoading(false));

    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    if (!workspaceId) return;
    await notificationsApi.markRead(workspaceId, id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [workspaceId]);

  const markAllRead = useCallback(async () => {
    if (!workspaceId) return;
    await notificationsApi.markAllRead(workspaceId);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, [workspaceId]);

  const dismiss = useCallback(async (id: string) => {
    if (!workspaceId) return;
    const wasUnread = notifications.find(n => n.id === id && !n.read);
    await notificationsApi.delete(workspaceId, id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
  }, [workspaceId, notifications]);

  return { notifications, unreadCount, markRead, markAllRead, dismiss, loading, refresh: fetchNotifications };
}
