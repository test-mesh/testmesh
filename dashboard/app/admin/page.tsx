'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Activity,
  Server,
  Database,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowUpRight,
  TrendingUp,
  Workflow,
  Calendar,
  Plug,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalFlows: number;
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  activeSchedules: number;
  queuedJobs: number;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: boolean;
  scheduler: boolean;
  plugins: number;
  uptime: string;
  version: string;
}

interface RecentActivity {
  id: string;
  type: 'execution' | 'user' | 'schedule';
  description: string;
  timestamp: string;
  status?: 'success' | 'failure';
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading dashboard data
    const loadData = async () => {
      // In production, these would be API calls
      await new Promise((resolve) => setTimeout(resolve, 500));

      setStats({
        totalUsers: 24,
        activeUsers: 8,
        totalFlows: 156,
        totalExecutions: 12847,
        successRate: 94.2,
        avgDuration: 2340,
        activeSchedules: 12,
        queuedJobs: 3,
      });

      setHealth({
        status: 'healthy',
        database: true,
        scheduler: true,
        plugins: 5,
        uptime: '14d 6h 32m',
        version: '1.0.0',
      });

      setActivity([
        {
          id: '1',
          type: 'execution',
          description: 'Flow "User API Tests" completed',
          timestamp: '2 minutes ago',
          status: 'success',
        },
        {
          id: '2',
          type: 'user',
          description: 'New user "john.doe@example.com" registered',
          timestamp: '15 minutes ago',
        },
        {
          id: '3',
          type: 'execution',
          description: 'Flow "Payment Gateway" failed',
          timestamp: '1 hour ago',
          status: 'failure',
        },
        {
          id: '4',
          type: 'schedule',
          description: 'Schedule "Nightly Regression" triggered',
          timestamp: '3 hours ago',
        },
      ]);

      setLoading(false);
    };

    loadData();
  }, []);

  const StatusBadge = ({ healthy }: { healthy: boolean }) => (
    healthy ? (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
        <CheckCircle className="w-3 h-3 mr-1" />
        Healthy
      </Badge>
    ) : (
      <Badge variant="destructive">
        <AlertCircle className="w-3 h-3 mr-1" />
        Unhealthy
      </Badge>
    )
  );

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">System overview and management</p>
        </div>
        <div className="flex items-center gap-2">
          {health && <StatusBadge healthy={health.status === 'healthy'} />}
          <Badge variant="outline">v{health?.version}</Badge>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeUsers} active now
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Flows</CardTitle>
            <Workflow className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalFlows}</div>
            <p className="text-xs text-muted-foreground">
              Across all workspaces
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.successRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats?.totalExecutions.toLocaleString()} total executions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? (stats.avgDuration / 1000).toFixed(1) : 0}s
            </div>
            <p className="text-xs text-muted-foreground">
              Per execution
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Health */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5" />
              System Health
            </CardTitle>
            <CardDescription>Service status and uptime</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Database</span>
              </div>
              <StatusBadge healthy={health?.database || false} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Scheduler</span>
              </div>
              <StatusBadge healthy={health?.scheduler || false} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Plugins</span>
              </div>
              <Badge variant="outline">{health?.plugins} active</Badge>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-mono">{health?.uptime}</span>
              </div>
            </div>

            <Button variant="outline" className="w-full" asChild>
              <Link href="/admin/health">
                View Details
                <ArrowUpRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {item.type === 'execution' && item.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    {item.type === 'execution' && item.status === 'failure' && (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    {item.type === 'user' && (
                      <Users className="w-4 h-4 text-blue-500" />
                    )}
                    {item.type === 'schedule' && (
                      <Calendar className="w-4 h-4 text-purple-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{item.description}</p>
                    <p className="text-xs text-muted-foreground">{item.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/users">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                <CardTitle className="text-base">User Management</CardTitle>
              </div>
              <CardDescription>Manage users, roles, and permissions</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/integrations">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Plug className="w-5 h-5 text-orange-500" />
                <CardTitle className="text-base">Integrations</CardTitle>
              </div>
              <CardDescription>Configure AI providers and Git webhooks</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/health">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-500" />
                <CardTitle className="text-base">System Health</CardTitle>
              </div>
              <CardDescription>Monitor services and resources</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/schedules">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-500" />
                <CardTitle className="text-base">Schedules</CardTitle>
              </div>
              <CardDescription>
                {stats?.activeSchedules} active, {stats?.queuedJobs} queued
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
