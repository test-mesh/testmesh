'use client';

import { useState } from 'react';
import { useActivity } from '@/lib/hooks/useCollaboration';
import { getEventDescription, getEventIcon, type ActivityEvent } from '@/lib/api/collaboration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Activity, RefreshCw, Search, Filter } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import Link from 'next/link';

export default function ActivityPage() {
  const [resourceType, setResourceType] = useState<string>('all');
  const [eventType, setEventType] = useState<string>('all');
  const [limit, setLimit] = useState(50);

  const { data, isLoading, refetch } = useActivity({
    resource_type: resourceType === 'all' ? undefined : resourceType,
    event_type: eventType === 'all' ? undefined : eventType,
    limit,
  });

  const getResourceLink = (event: ActivityEvent): string | null => {
    switch (event.resource_type) {
      case 'flow':
        return `/flows/${event.resource_id}`;
      case 'collection':
        return `/collections`;
      case 'execution':
        return `/executions/${event.resource_id}`;
      default:
        return null;
    }
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getEventBadgeColor = (eventType: string): string => {
    if (eventType.includes('created')) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
    if (eventType.includes('updated')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
    if (eventType.includes('deleted')) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
    if (eventType.includes('completed')) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
    if (eventType.includes('failed')) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
    if (eventType.includes('started')) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity Feed</h1>
          <p className="text-muted-foreground">
            Track changes and activity across your workspace
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Resource" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                <SelectItem value="flow">Flows</SelectItem>
                <SelectItem value="collection">Collections</SelectItem>
                <SelectItem value="execution">Executions</SelectItem>
              </SelectContent>
            </Select>

            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Event Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="flow.created">Created</SelectItem>
                <SelectItem value="flow.updated">Updated</SelectItem>
                <SelectItem value="flow.deleted">Deleted</SelectItem>
                <SelectItem value="execution.started">Execution Started</SelectItem>
                <SelectItem value="execution.completed">Execution Completed</SelectItem>
                <SelectItem value="execution.failed">Execution Failed</SelectItem>
                <SelectItem value="comment.added">Comments</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.events || data.events.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No activity found</h3>
              <p className="text-muted-foreground">
                Activity will appear here as you use TestMesh.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.events.map((event) => {
                const link = getResourceLink(event);
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={event.actor_avatar} />
                      <AvatarFallback>{getInitials(event.actor_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getEventIcon(event.event_type)}</span>
                        <p className="text-sm">
                          {link ? (
                            <Link href={link} className="hover:underline">
                              {getEventDescription(event)}
                            </Link>
                          ) : (
                            getEventDescription(event)
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getEventBadgeColor(event.event_type)}>
                          {event.event_type.split('.').pop()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      {event.description && (
                        <p className="text-sm text-muted-foreground">{event.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {data.total > limit && (
                <div className="text-center pt-4">
                  <Button variant="outline" onClick={() => setLimit(limit + 50)}>
                    Load More
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
