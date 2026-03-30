'use client';

import { useState, useEffect } from 'react';
import {
  Activity,
  Database,
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
  lastCheck: string;
}

interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  uptime: string;
  version: string;
  goroutines: number;
  connections: number;
}

interface DatabaseMetrics {
  connections: number;
  maxConnections: number;
  queryTime: number;
  slowQueries: number;
}

export default function HealthPage() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [dbMetrics, setDbMetrics] = useState<DatabaseMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadHealth = async () => {
    setLoading(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));

    setServices([
      {
        name: 'API Server',
        status: 'healthy',
        latency: 12,
        lastCheck: 'Just now',
      },
      {
        name: 'Database (PostgreSQL)',
        status: 'healthy',
        latency: 5,
        lastCheck: 'Just now',
      },
      {
        name: 'Scheduler',
        status: 'healthy',
        message: '12 active schedules',
        lastCheck: 'Just now',
      },
      {
        name: 'Plugin System',
        status: 'healthy',
        message: '5 plugins loaded',
        lastCheck: 'Just now',
      },
      {
        name: 'WebSocket Hub',
        status: 'healthy',
        message: '3 active connections',
        lastCheck: 'Just now',
      },
    ]);

    setMetrics({
      cpu: 23,
      memory: 45,
      disk: 62,
      uptime: '14d 6h 32m',
      version: '1.0.0',
      goroutines: 124,
      connections: 8,
    });

    setDbMetrics({
      connections: 5,
      maxConnections: 100,
      queryTime: 2.4,
      slowQueries: 0,
    });

    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    loadHealth();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-100 text-green-700">Healthy</Badge>;
      case 'degraded':
        return <Badge className="bg-yellow-100 text-yellow-700">Degraded</Badge>;
      case 'unhealthy':
        return <Badge variant="destructive">Unhealthy</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getProgressColor = (value: number) => {
    if (value < 60) return 'bg-green-500';
    if (value < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading && !metrics) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const overallStatus = services.every((s) => s.status === 'healthy')
    ? 'healthy'
    : services.some((s) => s.status === 'unhealthy')
    ? 'unhealthy'
    : 'degraded';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6" />
            System Health
          </h1>
          <p className="text-muted-foreground">
            Monitor services and system resources
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(overallStatus)}
          <Button variant="outline" onClick={loadHealth} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* System Resources */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
            <Cpu className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.cpu}%</div>
            <Progress
              value={metrics?.cpu}
              className={`mt-2 [&>div]:${getProgressColor(metrics?.cpu || 0)}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <MemoryStick className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.memory}%</div>
            <Progress
              value={metrics?.memory}
              className={`mt-2 [&>div]:${getProgressColor(metrics?.memory || 0)}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Disk Usage</CardTitle>
            <HardDrive className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.disk}%</div>
            <Progress
              value={metrics?.disk}
              className={`mt-2 [&>div]:${getProgressColor(metrics?.disk || 0)}`}
            />
          </CardContent>
        </Card>
      </div>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
          <CardDescription>Status of all system services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(service.status)}
                  <div>
                    <div className="font-medium">{service.name}</div>
                    {service.message && (
                      <div className="text-sm text-muted-foreground">
                        {service.message}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {service.latency !== undefined && (
                    <div className="text-sm text-muted-foreground">
                      {service.latency}ms
                    </div>
                  )}
                  {getStatusBadge(service.status)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Database Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="w-5 h-5" />
              Database Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Active Connections</span>
              <span className="font-mono">
                {dbMetrics?.connections} / {dbMetrics?.maxConnections}
              </span>
            </div>
            <Progress
              value={(dbMetrics?.connections || 0) / (dbMetrics?.maxConnections || 1) * 100}
              className="h-2"
            />
            <div className="flex items-center justify-between">
              <span className="text-sm">Avg Query Time</span>
              <span className="font-mono">{dbMetrics?.queryTime}ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Slow Queries (last hour)</span>
              <span className="font-mono">{dbMetrics?.slowQueries}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="w-5 h-5" />
              Runtime Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Uptime</span>
              <span className="font-mono">{metrics?.uptime}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Version</span>
              <Badge variant="outline">v{metrics?.version}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Goroutines</span>
              <span className="font-mono">{metrics?.goroutines}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">WebSocket Connections</span>
              <span className="font-mono">{metrics?.connections}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Refresh */}
      <div className="flex items-center justify-center text-sm text-muted-foreground">
        <Clock className="w-4 h-4 mr-1" />
        Last updated: {lastRefresh.toLocaleTimeString()}
      </div>
    </div>
  );
}
