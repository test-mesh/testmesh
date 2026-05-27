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
    <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
      <p className="text-[13px] font-semibold text-[#c8dce8] mb-4">{title}</p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#4a6480', fontSize: 11 }}
            axisLine={{ stroke: '#1e2d3d' }}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#4a6480', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          {showPassRate && (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: '#4a6480', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f1923',
              border: '1px solid #1e2d3d',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#c8dce8',
            }}
            labelStyle={{ color: '#7fa8c8', marginBottom: 4 }}
          />
          <Legend wrapperStyle={{ fontSize: '11px', color: '#4a6480' }} />
          {showExecutions && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="executions"
              stroke="#2dd4bf"
              strokeWidth={2}
              dot={{ r: 3, fill: '#2dd4bf' }}
              name="Executions"
            />
          )}
          {showPassRate && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="pass_rate"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ r: 3, fill: '#34d399' }}
              name="Pass Rate (%)"
            />
          )}
          {showDuration && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="duration_sec"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={{ r: 3, fill: '#fbbf24' }}
              name="Avg Duration (s)"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
