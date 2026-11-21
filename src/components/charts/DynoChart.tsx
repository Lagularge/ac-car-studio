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
import type { DynoPoint } from '../../types/ac';

interface DynoChartProps {
  curve: DynoPoint[];
  compareCurve?: DynoPoint[];
  compareLabel?: string;
  showNaBase?: boolean;
  height?: number;
  unitMode?: 'ps' | 'bhp';
}

export const DynoChart: React.FC<DynoChartProps> = ({
  curve,
  compareCurve,
  compareLabel = '比較車両',
  showNaBase = true,
  height = 300,
  unitMode = 'ps',
}) => {
  const hasBoost = curve.some((p) => p.boostBar > 0.02);
  const hasHybrid = curve.some((p) => (p.motorPowerPs ?? 0) > 0.5);

  // Merge main curve with optional compare curve by RPM
  const merged = React.useMemo(() => {
    if (!compareCurve || compareCurve.length === 0) {
      return curve.map((p) => ({
        rpm: p.rpm,
        power: unitMode === 'ps' ? p.totalPowerPs : p.totalPowerBhp,
        torque: p.totalTorqueNm,
        naPower: unitMode === 'ps' ? p.naPowerPs : p.naPowerBhp,
        naTorque: p.naTorqueNm,
        boost: p.boostBar,
        combinedPower:
          p.combinedPowerPs !== undefined
            ? Number((unitMode === 'ps' ? p.combinedPowerPs : p.combinedPowerPs * 0.98632).toFixed(1))
            : undefined,
        combinedTorque: p.combinedTorqueNm,
      }));
    }

    const rpmSet = new Set<number>();
    curve.forEach((p) => rpmSet.add(p.rpm));
    compareCurve.forEach((p) => rpmSet.add(p.rpm));
    const rpms = Array.from(rpmSet).sort((a, b) => a - b);

    const mainMap = new Map(curve.map((p) => [p.rpm, p]));
    const cmpMap = new Map(compareCurve.map((p) => [p.rpm, p]));

    return rpms.map((rpm) => {
      const m = mainMap.get(rpm);
      const c = cmpMap.get(rpm);
      return {
        rpm,
        power: m ? (unitMode === 'ps' ? m.totalPowerPs : m.totalPowerBhp) : undefined,
        torque: m ? m.totalTorqueNm : undefined,
        cmpPower: c ? (unitMode === 'ps' ? c.totalPowerPs : c.totalPowerBhp) : undefined,
        cmpTorque: c ? c.totalTorqueNm : undefined,
      };
    });
  }, [curve, compareCurve, unitMode]);

  const powerUnit = unitMode === 'ps' ? 'PS' : 'BHP';

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 10, right: 20, left: 4, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2738" />
          <XAxis
            dataKey="rpm"
            stroke="#64748b"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={(v) => `${v}`}
            label={{ value: 'RPM', position: 'insideBottomRight', offset: -2, fill: '#64748b', fontSize: 11 }}
          />
          <YAxis
            yAxisId="left"
            stroke="#f43f5e"
            tick={{ fill: '#fda4af', fontSize: 11 }}
            label={{ value: `出力 (${powerUnit}) / トルク (Nm)`, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
          />
          {hasBoost && !compareCurve && (
            <YAxis
              yAxisId="boost"
              orientation="right"
              stroke="#06b6d4"
              tick={{ fill: '#67e8f9', fontSize: 11 }}
              domain={[0, 'auto']}
              label={{ value: 'Boost (bar)', angle: 90, position: 'insideRight', fill: '#67e8f9', fontSize: 11 }}
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f141f',
              border: '1px solid #2b354b',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(v) => `${v} RPM`}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="power"
            name={`出力 (${powerUnit})`}
            stroke="#f43f5e"
            strokeWidth={2.6}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="torque"
            name="トルク (Nm)"
            stroke="#f59e0b"
            strokeWidth={2.4}
            dot={false}
            connectNulls
          />

          {hasHybrid && !compareCurve && (
            <>
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="combinedPower"
                name={`システム合算出力 (${powerUnit})`}
                stroke="#10b981"
                strokeWidth={2.6}
                strokeDasharray="6 3"
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="combinedTorque"
                name="システム合算トルク (Nm)"
                stroke="#22d3ee"
                strokeWidth={2.0}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
              />
            </>
          )}

          {hasBoost && showNaBase && !compareCurve && (
            <>
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="naTorque"
                name="NAベース トルク (Nm)"
                stroke="#f59e0b"
                strokeOpacity={0.35}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                yAxisId="boost"
                type="monotone"
                dataKey="boost"
                name="ブースト圧 (bar)"
                stroke="#06b6d4"
                strokeWidth={1.8}
                dot={false}
              />
            </>
          )}

          {compareCurve && compareCurve.length > 0 && (
            <>
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cmpPower"
                name={`${compareLabel} 出力 (${powerUnit})`}
                stroke="#38bdf8"
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cmpTorque"
                name={`${compareLabel} トルク (Nm)`}
                stroke="#a78bfa"
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
