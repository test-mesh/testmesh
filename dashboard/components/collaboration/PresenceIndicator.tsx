'use client';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePresence } from '@/lib/hooks/useCollaboration';
import type { UserPresence } from '@/lib/api/collaboration';
import { cn } from '@/lib/utils';

interface PresenceIndicatorProps {
  resourceType: string;
  resourceId: string;
  maxVisible?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PresenceIndicator({
  resourceType,
  resourceId,
  maxVisible = 5,
  size = 'md',
  className,
}: PresenceIndicatorProps) {
  const { data, isLoading } = usePresence(resourceType, resourceId);

  const presences = data?.presences || [];
  const visiblePresences = presences.slice(0, maxVisible);
  const hiddenCount = presences.length - maxVisible;

  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading || presences.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className={cn('flex items-center -space-x-2', className)}>
        {visiblePresences.map((presence) => (
          <Tooltip key={presence.id}>
            <TooltipTrigger asChild>
              <div className="relative">
                <Avatar
                  className={cn(
                    sizeClasses[size],
                    'border-2 border-background ring-2',
                    presence.status === 'editing' ? 'ring-green-500' : 'ring-blue-500'
                  )}
                  style={{ backgroundColor: presence.color }}
                >
                  {presence.user_avatar ? (
                    <AvatarImage src={presence.user_avatar} alt={presence.user_name} />
                  ) : null}
                  <AvatarFallback
                    className="text-white"
                    style={{ backgroundColor: presence.color }}
                  >
                    {getInitials(presence.user_name)}
                  </AvatarFallback>
                </Avatar>
                {presence.status === 'editing' && (
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500 ring-2 ring-background" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <p className="font-medium">{presence.user_name}</p>
                <p className="text-muted-foreground">
                  {presence.status === 'editing' ? 'Editing' : 'Viewing'}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
        {hiddenCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className={cn(sizeClasses[size], 'border-2 border-background bg-muted')}>
                <AvatarFallback className="text-muted-foreground">
                  +{hiddenCount}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <p>{hiddenCount} more user{hiddenCount > 1 ? 's' : ''}</p>
                <ul className="mt-1 text-muted-foreground">
                  {presences.slice(maxVisible).map((p) => (
                    <li key={p.id}>{p.user_name}</li>
                  ))}
                </ul>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

// Compact inline version for headers
export function PresenceAvatars({
  presences,
  maxVisible = 3,
  size = 'sm',
}: {
  presences: UserPresence[];
  maxVisible?: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const visiblePresences = presences.slice(0, maxVisible);
  const hiddenCount = presences.length - maxVisible;

  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (presences.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center -space-x-1.5">
      {visiblePresences.map((presence) => (
        <Avatar
          key={presence.id}
          className={cn(sizeClasses[size], 'border border-background')}
          style={{ backgroundColor: presence.color }}
        >
          {presence.user_avatar ? (
            <AvatarImage src={presence.user_avatar} alt={presence.user_name} />
          ) : null}
          <AvatarFallback
            className="text-white text-[10px]"
            style={{ backgroundColor: presence.color }}
          >
            {getInitials(presence.user_name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {hiddenCount > 0 && (
        <Avatar className={cn(sizeClasses[size], 'border border-background bg-muted')}>
          <AvatarFallback className="text-muted-foreground text-[10px]">
            +{hiddenCount}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
