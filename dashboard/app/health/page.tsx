'use client';

import { useState, useEffect } from 'react';
import {
  Activity, Database, Server, Cpu, HardDrive, MemoryStick,
  Clock, RefreshCw, CheckCircle, AlertCircle, XCircle,
} from 'lucide-react';

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

const STATUS_STYLES: Record<string, { badge: string; icon: React.ElementType; iconColor: string }> = {
  healthy:   { badge: 'bg-teal-400/10 text-teal-400 border-teal-400/30',    icon: CheckCircle, iconColor: 'text-teal-400' },
  degraded:  { badge: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30', icon: AlertCircle, iconColor: 'text-yellow-400' },
  unhealthy: { badge: 'bg-red-400/10 text-red-400 border-red-400/30',        icon: XCircle,     iconColor: 'text-red-400' },
};

function progressColor(v: number) {
  return v < 60 ? 'bg-teal-400' : v < 80 ? 'bg-yellow-400' : 'bg-red-400';
}

function MetricBar({ label, value, suffix = '%' }: { label: string; value?: number; suffix?: string }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[#4a6480]">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 bg-[#1a2332] rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${progressColor(v)}`} style={{ width: `${v}%` }} />
        </div>
        <span className="font-mono text-[#c8dce8] w-10 text-right">{v}{suffix}</span>
      </div>
    </div>
  );
}

export default function HealthPage() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [dbMetrics, setDbMetrics] = useState<DatabaseMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadHealth = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setServices([
      { name: 'API Server',           status: 'healthy', latency: 12, lastCheck: 'Just now' },
      { name: 'Database (PostgreSQL)', status: 'healthy', latency: 5,  lastCheck: 'Just now' },
      { name: 'Scheduler',            status: 'healthy', message: '12 active schedules', lastCheck: 'Just now' },
      { name: 'Plugin System',        status: 'healthy', message: '5 plugins loaded',    lastCheck: 'Just now' },
      { name: 'WebSocket Hub',        status: 'healthy', message: '3 active connections', lastCheck: 'Just now' },
    ]);
    setMetrics({ cpu: 23, memory: 45, disk: 62, uptime: '14d 6h 32m', version: '1.0.0', goroutines: 124, connections: 8 });
    setDbMetrics({ connections: 5, maxConnections: 100, queryTime: 2.4, slowQueries: 0 });
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const overallStatus = services.length === 0 ? 'healthy'
    : services.every((s) => s.status === 'healthy') ? 'healthy'
    : services.some((s) => s.status === 'unhealthy') ? 'unhealthy'
    : 'degraded';

  const overall = STATUS_STYLES[overallStatus];

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#3d5670]" />
          <h1 className="text-xl font-semibold text-[#c8dce8]">System Health</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Monitor services and system resources</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${overall.badge}`}>
            {overallStatus}
          </span>
          <button
            onClick={loadHealth}
            disabled={loading}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* System Resources */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'CPU Usage', value: metrics?.cpu, icon: Cpu },
          { label: 'Memory Usage', value: metrics?.memory, icon: MemoryStick },
          { label: 'Disk Usage', value: metrics?.disk, icon: HardDrive },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{label}</p>
              <Icon className="h-3.5 w-3.5 text-[#3d5670]" />
            </div>
            <p className="text-2xl font-bold text-[#c8dce8] mb-2">{value}%</p>
            <div className="w-full h-1.5 bg-[#1a2332] rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${progressColor(value ?? 0)}`} style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Services */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
          <Server className="h-3.5 w-3.5 text-[#4a6480]" />
          <span className="text-[11px] font-semibold text-[#c8dce8]">Services</span>
          <span className="text-[10px] text-[#4a6480]">Status of all system services</span>
        </div>
        <div className="divide-y divide-[#1a2332]">
          {services.map((service) => {
            const st = STATUS_STYLES[service.status];
            const Icon = st.icon;
            return (
              <div key={service.name} className="flex items-center justify-between px-4 py-2.5 hover:bg-[#131b26] transition-colors">
                <div className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 ${st.iconColor}`} />
                  <div>
                    <p className="text-xs font-medium text-[#c8dce8]">{service.name}</p>
                    {service.message && <p className="text-[10px] text-[#4a6480]">{service.message}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {service.latency !== undefined && (
                    <span className="text-[10px] font-mono text-[#4a6480]">{service.latency}ms</span>
                  )}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${st.badge}`}>
                    {service.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DB + Runtime */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-[#4a6480]" />
            <span className="text-[11px] font-semibold text-[#c8dce8]">Database Metrics</span>
          </div>
          <div className="p-4 space-y-3">
            <MetricBar
              label={`Active Connections (max ${dbMetrics?.maxConnections})`}
              value={Math.round(((dbMetrics?.connections ?? 0) / (dbMetrics?.maxConnections ?? 1)) * 100)}
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#4a6480]">Avg Query Time</span>
              <span className="font-mono text-[#c8dce8]">{dbMetrics?.queryTime}ms</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#4a6480]">Slow Queries (last hour)</span>
              <span className="font-mono text-[#c8dce8]">{dbMetrics?.slowQueries}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-[#4a6480]" />
            <span className="text-[11px] font-semibold text-[#c8dce8]">Runtime Info</span>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: 'Uptime',                value: metrics?.uptime },
              { label: 'Version',               value: metrics ? `v${metrics.version}` : '—' },
              { label: 'Goroutines',            value: metrics?.goroutines },
              { label: 'WebSocket Connections', value: metrics?.connections },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <span className="text-[#4a6480]">{label}</span>
                <span className="font-mono text-[#c8dce8]">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#3d5670]">
        <Clock className="w-3 h-3" />
        Last updated: {lastRefresh.toLocaleTimeString()}
      </div>
    </div>
  );
}
