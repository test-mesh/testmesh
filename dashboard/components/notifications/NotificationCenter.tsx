'use client';

import { formatDistanceToNow } from 'date-fns';
import { Bell, Check, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';

export function NotificationCenter() {
  const { notifications, unreadCount, markRead, markAllRead, dismiss } = useNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative flex items-center justify-center h-8 w-8 rounded-lg text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-red-400 text-[#0b0f18] text-[9px] font-bold">
              {unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="h-6 px-2 rounded text-[10px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
            >
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-8 w-8 text-[#3d5670] mb-2" />
              <p className="text-sm text-[#4a6480]">No notifications</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  'flex gap-2 px-2 py-3 border-b border-[#1a2332] last:border-0 hover:bg-[#131b26] transition-colors',
                  !notification.read && 'bg-teal-400/3'
                )}
              >
                <div className="flex-1 space-y-1 min-w-0">
                  <p className="text-xs font-medium text-[#c8dce8] leading-none">
                    {notification.title}
                  </p>
                  <p className="text-[10px] text-[#7fa8c8]">{notification.message}</p>
                  <p className="text-[10px] text-[#4a6480]">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!notification.read && (
                    <button
                      onClick={() => markRead(notification.id)}
                      title="Mark as read"
                      className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-teal-400 hover:bg-[#1a2d3d] transition-colors"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => dismiss(notification.id)}
                    title="Dismiss"
                    className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
