'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TrendData {
  date: string;
  executions: number;
  pass_rate: number;
  avg_duration_ms: number;
}

interface TrendChartProps {
  data: TrendData[];
  title?: string;
  showExecutions?: boolean;
  showPassRate?: boolean;
  showDuration?: boolean;
  height?: number;
}

export function TrendChart({
  data,
  title = 'Execution Trends',
  showExecutions = true,
  showPassRate = true,
  showDuration = false,
  height = 300,
}: TrendChartProps) {
  const formattedData = data.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    duration_sec: (d.avg_duration_ms / 1000).toFixed(2),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              className="text-xs"
              tick={{ fill: 'currentColor' }}
            />
            <YAxis
              yAxisId="left"
              className="text-xs"
              tick={{ fill: 'currentColor' }}
            />
            {showPassRate && (
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                className="text-xs"
                tick={{ fill: 'currentColor' }}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Legend />
            {showExecutions && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="executions"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Executions"
              />
            )}
            {showPassRate && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="pass_rate"
                stroke="hsl(142.1 76.2% 36.3%)"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Pass Rate (%)"
              />
            )}
            {showDuration && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="duration_sec"
                stroke="hsl(var(--warning))"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Avg Duration (s)"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
