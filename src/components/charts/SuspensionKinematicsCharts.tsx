import React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Compass, Gauge, TrendingUp } from 'lucide-react';
import type { SuspensionKinematicsAnalysis } from '../../utils/suspensionKinematics';

interface SuspensionKinematicsChartsProps {
  analysis: SuspensionKinematicsAnalysis;
  testLoadFactor: number;
  testLateralG: number;
  onChangeLoadFactor?: (val: number) => void;
  onChangeLateralG?: (val: number) => void;
}

export const SuspensionKinematicsCharts: React.FC<SuspensionKinematicsChartsProps> = ({
  analysis,
  testLoadFactor,
  testLateralG,
  onChangeLoadFactor,
  onChangeLateralG,
}) => {
  const nearestLoadFactor = Number((Math.round(testLoadFactor * 10) / 10).toFixed(2));
  const nearestLatG = Number((Math.round(Math.abs(testLateralG) * 10) / 10).toFixed(1));

  return (
    <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-4">
      {/* Header & Summary KPI Cards */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222b3e] pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              サスペンション・キネマティクス &amp; Roll挙動テレメトリーグラフ
            </h3>
            <p className="text-[11px] text-slate-400">
              荷重変化時のキャンバー・トー・車高変化およびコーナリング横G入力時のロール角・対地キャンバー・輪荷重移動
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-num">
          <div className="bg-[#0b0e14] border border-[#242e42] rounded-lg px-2.5 py-1">
            <span className="text-slate-400">ロール勾配: </span>
            <strong className="text-amber-300">{analysis.rollGradientDegPerG}° / G</strong>
          </div>
          <div className="bg-[#0b0e14] border border-[#242e42] rounded-lg px-2.5 py-1">
            <span className="text-slate-400">前ロール剛性比 (LLTD): </span>
            <strong className="text-cyan-300">{analysis.frontRollStiffnessSharePct}%</strong>
          </div>
          <div className="bg-[#0b0e14] border border-[#242e42] rounded-lg px-2.5 py-1 text-emerald-300">
            {analysis.underOversteerBalanceLabel}
          </div>
        </div>
      </div>

      {/* Interactive Scrubbers for Graph Cursor + 3D Posture */}
      {(onChangeLoadFactor || onChangeLateralG) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#0c1018] border border-[#222b3e] rounded-xl p-2.5 text-xs">
          {onChangeLoadFactor && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-cyan-300 font-semibold shrink-0">
                グラフ＆3D連動 垂直荷重倍率:
              </span>
              <input
                type="range"
                min={0.2}
                max={2.2}
                step={0.05}
                value={testLoadFactor}
                onChange={(e) => onChangeLoadFactor(Number(e.target.value))}
                className="flex-1 h-1.5 accent-cyan-400"
              />
              <span className="font-mono-num text-[11px] text-cyan-200 w-24 text-right">
                {Math.round(testLoadFactor * 100)}% (F:{Math.round(analysis.frontStaticWheelLoadKgf * testLoadFactor)}kgf)
              </span>
            </div>
          )}

          {onChangeLateralG && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-amber-300 font-semibold shrink-0">
                グラフ＆3D連動 旋回横G (Roll):
              </span>
              <input
                type="range"
                min={-1.8}
                max={1.8}
                step={0.05}
                value={testLateralG}
                onChange={(e) => onChangeLateralG(Number(e.target.value))}
                className="flex-1 h-1.5 accent-amber-400"
              />
              <span className="font-mono-num text-[11px] text-amber-200 w-24 text-right">
                {testLateralG >= 0 ? `+${testLateralG.toFixed(2)}` : testLateralG.toFixed(2)} G (
                {(analysis.rollGradientDegPerG * Math.abs(testLateralG)).toFixed(2)}°)
              </span>
            </div>
          )}
        </div>
      )}

      {/* 2x2 Telemetry Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CHART 1: Load vs Camber Angle */}
        <div className="bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-rose-300 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              1. 荷重変化時のキャンバー角変化 (Load vs Camber)
            </span>
            <span className="text-[10px] font-mono-num text-slate-400">
              1G静止: F {analysis.input.frontStaticCamberDeg.toFixed(2)}° / R{' '}
              {analysis.input.rearStaticCamberDeg.toFixed(2)}°
            </span>
          </div>
          <div className="h-[195px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={analysis.loadSweep}
                margin={{ top: 8, right: 14, left: -10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2333" />
                <XAxis
                  dataKey="loadFactor"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                />
                <YAxis
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(v) => `${v}°`}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0e131f',
                    border: '1px solid #2b354b',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  formatter={(value: number, name: string) => [`${Number(value).toFixed(2)}°`, name]}
                  labelFormatter={(label) =>
                    `垂直荷重: ${Math.round(Number(label) * 100)}% (F:${Math.round(
                      analysis.frontStaticWheelLoadKgf * Number(label)
                    )}kgf / R:${Math.round(analysis.rearStaticWheelLoadKgf * Number(label))}kgf)`
                  }
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <ReferenceLine x={1.0} stroke="#475569" strokeDasharray="3 3" />
                <ReferenceLine x={nearestLoadFactor} stroke="#22d3ee" strokeWidth={1.5} />
                <Line
                  type="monotone"
                  dataKey="frontCamberDeg"
                  name="フロント キャンバー (deg)"
                  stroke="#f43f5e"
                  strokeWidth={2.2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="rearCamberDeg"
                  name="リア キャンバー (deg)"
                  stroke="#38bdf8"
                  strokeWidth={2.2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: Load vs Toe Angle (Bump Steer) */}
        <div className="bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              2. 荷重変化時のトー角変化・バンプステア (Load vs Toe)
            </span>
            <span className="text-[10px] font-mono-num text-slate-400">
              1G静止: F {analysis.frontStaticToeDeg.toFixed(2)}° / R{' '}
              {analysis.rearStaticToeDeg.toFixed(2)}°
            </span>
          </div>
          <div className="h-[195px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={analysis.loadSweep}
                margin={{ top: 8, right: 14, left: -10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2333" />
                <XAxis
                  dataKey="loadFactor"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                />
                <YAxis
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(v) => `${Number(v).toFixed(2)}°`}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0e131f',
                    border: '1px solid #2b354b',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  formatter={(value: number, name: string) => [`${Number(value).toFixed(3)}°`, name]}
                  labelFormatter={(label) => `垂直荷重: ${Math.round(Number(label) * 100)}%`}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <ReferenceLine y={0} stroke="#334155" />
                <ReferenceLine x={1.0} stroke="#475569" strokeDasharray="3 3" />
                <ReferenceLine x={nearestLoadFactor} stroke="#22d3ee" strokeWidth={1.5} />
                <Line
                  type="monotone"
                  dataKey="frontToeDeg"
                  name="フロント トー角 (deg)"
                  stroke="#fb7185"
                  strokeWidth={2.2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="rearToeDeg"
                  name="リア トー角 (deg)"
                  stroke="#22d3ee"
                  strokeWidth={2.2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 3: Load vs Ride Height & Deflection */}
        <div className="bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              3. 荷重変化時の車高・ストローク変化 (Load vs Ride Height)
            </span>
            <span className="text-[10px] font-mono-num text-slate-400">
              1G車高: F {analysis.frontStaticRideHeightMm}mm / R {analysis.rearStaticRideHeightMm}mm
            </span>
          </div>
          <div className="h-[195px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={analysis.loadSweep}
                margin={{ top: 8, right: 14, left: -6, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2333" />
                <XAxis
                  dataKey="loadFactor"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                />
                <YAxis
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(v) => `${v}mm`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0e131f',
                    border: '1px solid #2b354b',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  formatter={(value: number, name: string) => [`${Number(value).toFixed(1)} mm`, name]}
                  labelFormatter={(label) => `垂直荷重: ${Math.round(Number(label) * 100)}%`}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <ReferenceLine x={1.0} stroke="#475569" strokeDasharray="3 3" />
                <ReferenceLine x={nearestLoadFactor} stroke="#22d3ee" strokeWidth={1.5} />
                <Line
                  type="monotone"
                  dataKey="frontRideHeightMm"
                  name="フロント車高 (mm)"
                  stroke="#f43f5e"
                  strokeWidth={2.2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="rearRideHeightMm"
                  name="リア車高 (mm)"
                  stroke="#38bdf8"
                  strokeWidth={2.2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="frontDeflectionMm"
                  name="Fストローク変位 (mm)"
                  stroke="#fbbf24"
                  strokeWidth={1.6}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 4: Roll Behavior (Lateral G vs Roll Angle, Outside Tire Ground Camber & Wheel Load Transfer) */}
        <div className="bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-amber-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              4. Roll時の挙動 (横G vs ロール角・外輪対地キャンバー・外輪荷重)
            </span>
            <span className="text-[10px] font-mono-num text-amber-200">
              1.0G時 Roll: {analysis.rollGradientDegPerG}°
            </span>
          </div>
          <div className="h-[195px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={analysis.rollSweep}
                margin={{ top: 8, right: 8, left: -10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2333" />
                <XAxis
                  dataKey="lateralG"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(v) => `${v}G`}
                />
                <YAxis
                  yAxisId="deg"
                  stroke="#fbbf24"
                  tick={{ fill: '#fde68a', fontSize: 10 }}
                  tickFormatter={(v) => `${v}°`}
                />
                <YAxis
                  yAxisId="kgf"
                  orientation="right"
                  stroke="#34d399"
                  tick={{ fill: '#6ee7b7', fontSize: 10 }}
                  tickFormatter={(v) => `${v}kg`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0e131f',
                    border: '1px solid #2b354b',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  labelFormatter={(label) => `旋回横G: ${label} G`}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <ReferenceLine yAxisId="deg" y={0} stroke="#475569" strokeDasharray="3 3" />
                <ReferenceLine yAxisId="deg" x={nearestLatG} stroke="#f59e0b" strokeWidth={1.5} />
                <Line
                  yAxisId="deg"
                  type="monotone"
                  dataKey="rollAngleDeg"
                  name="車体ロール角 (deg)"
                  stroke="#fbbf24"
                  strokeWidth={2.3}
                  dot={false}
                />
                <Line
                  yAxisId="deg"
                  type="monotone"
                  dataKey="frontOutsideGroundCamberDeg"
                  name="F外輪 対地キャンバー (deg)"
                  stroke="#f43f5e"
                  strokeWidth={2.0}
                  dot={false}
                />
                <Line
                  yAxisId="deg"
                  type="monotone"
                  dataKey="rearOutsideGroundCamberDeg"
                  name="R外輪 対地キャンバー (deg)"
                  stroke="#38bdf8"
                  strokeWidth={2.0}
                  dot={false}
                />
                <Line
                  yAxisId="kgf"
                  type="monotone"
                  dataKey="frontOuterLoadKgf"
                  name="F外輪 垂直荷重 (kgf)"
                  stroke="#34d399"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
