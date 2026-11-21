import React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GearSpeedPoint } from '../../types/ac';

interface GearChartProps {
  gears: GearSpeedPoint[];
  maxRpm: number;
  idleRpm: number;
  height?: number;
}

const GEAR_COLORS = [
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
];

export const GearChart: React.FC<GearChartProps> = ({
  gears,
  maxRpm,
  idleRpm,
  height = 280,
}) => {
  // Build unified speed grid from 0 to top gear maxSpeed
  const chartData = React.useMemo(() => {
    if (gears.length === 0) return [];
    const maxSpeed = Math.max(120, Math.ceil(gears[gears.length - 1].maxSpeedKmh / 10) * 10);
    const step = Math.max(5, Math.round(maxSpeed / 40));
    const rows: Array<Record<string, number | null>> = [];

    for (let speed = 0; speed <= maxSpeed; speed += step) {
      const row: Record<string, number | null> = { speed };
      for (const g of gears) {
        if (g.maxSpeedKmh <= 0) {
          row[`g${g.gear}`] = null;
          continue;
        }
        const rpm = (speed / g.maxSpeedKmh) * maxRpm;
        if (rpm >= idleRpm * 0.6 && rpm <= maxRpm * 1.02) {
          row[`g${g.gear}`] = Math.round(Math.min(maxRpm, rpm));
        } else {
          row[`g${g.gear}`] = null;
        }
      }
      rows.push(row);
    }
    return rows;
  }, [gears, maxRpm, idleRpm]);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 6, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2738" />
          <XAxis
            dataKey="speed"
            stroke="#64748b"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            label={{ value: '車速 (km/h)', position: 'insideBottomRight', offset: -2, fill: '#64748b', fontSize: 11 }}
          />
          <YAxis
            stroke="#64748b"
            domain={[0, Math.ceil(maxRpm / 1000) * 1000]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            label={{ value: 'RPM', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f141f',
              border: '1px solid #2b354b',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(v) => `${v} km/h`}
            formatter={(val: unknown, name: string) => [`${val} RPM`, name]}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          {gears.map((g, idx) => (
            <Line
              key={g.gear}
              type="linear"
              dataKey={`g${g.gear}`}
              name={`${g.gear}速 (Max ${g.maxSpeedKmh} km/h)`}
              stroke={GEAR_COLORS[idx % GEAR_COLORS.length]}
              strokeWidth={2.2}
              dot={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
