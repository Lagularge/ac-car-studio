import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Gauge, Layers, Sparkles, Volume2 } from 'lucide-react';

interface StartupSplashModalProps {
  open: boolean;
  onFinish: () => void;
}

const BOOT_MODULES = [
  {
    id: 'acd_physics',
    label: 'ACD CRYPTO & INI/LUT PHYSICS CORE',
    sub: 'Assetto Corsa data.acd 復号・空力/駆動系/タイヤ物理ソルバー',
    icon: Cpu,
    threshold: 18,
  },
  {
    id: 'kn5_csp',
    label: 'KN5 3D GEOMETRY & CSP PBR SHADER PIPELINE',
    sub: 'DirectX 11 DDS / MultiMap_NMDetail / 3Dパーツ抽出・ホイールスワップ',
    icon: Layers,
    threshold: 45,
  },
  {
    id: 'livery_oem',
    label: 'OEM PAINT CATALOG & MULTI-TEXTURE LIVERY ENGINE',
    sub: '12メーカー純正色・アルカンターラ/本革/成形色樹脂・3D UV自動最適化',
    icon: Sparkles,
    threshold: 72,
  },
  {
    id: 'engine_sound',
    label: '1D GAS-DYNAMICS & CSP LUA AUDIO SYNTHESIZER',
    sub: '熱力学筒内圧力・管路共鳴・機械駆動音・車内NVH・FMOD Luaエクスポーター',
    icon: Volume2,
    threshold: 92,
  },
] as const;

export const StartupSplashModal: React.FC<StartupSplashModalProps> = ({ open, onFinish }) => {
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!open) {
      setProgress(0);
      setExiting(false);
      return;
    }

    let rafId = 0;
    const durationMs = 2350;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      // Smooth cubic ease-out progress
      const eased = 1 - Math.pow(1 - t, 2.6);
      setProgress(Math.round(eased * 100));

      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setExiting(true);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [open]);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => {
      onFinish();
    }, 420);
    return () => window.clearTimeout(timer);
  }, [exiting, onFinish]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        setExiting(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  // Compute simulated tachometer RPM sweep (0 -> 9200 peak at 78% -> 1100 idle at 100%)
  const norm = progress / 100;
  const rpm =
    norm < 0.78
      ? Math.round(9200 * Math.pow(norm / 0.78, 1.35))
      : Math.round(9200 - (9200 - 1250) * Math.pow((norm - 0.78) / 0.22, 0.75));
  const rpmRatio = Math.min(1, Math.max(0, rpm / 9500));
  // Sweep angle from -130 deg to +130 deg
  const needleAngleDeg = -130 + rpmRatio * 260;

  return (
    <div
      onClick={() => setExiting(true)}
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-center bg-[#06090f] text-slate-100 select-none overflow-hidden transition-all duration-500 cursor-pointer ${
        exiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background Telemetry Grid & Radial Spotlights */}
      <div
        className="absolute inset-0 opacity-25 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 38%, rgba(244, 63, 94, 0.28) 0%, rgba(14, 165, 233, 0.14) 38%, transparent 72%),
            linear-gradient(to right, rgba(30, 41, 59, 0.45) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(30, 41, 59, 0.45) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 40px 40px, 40px 40px',
        }}
      />

      {/* Top Shift-Light LED Strip */}
      <div className="relative z-10 flex items-center gap-2 mb-5">
        {Array.from({ length: 12 }).map((_, idx) => {
          const lit = rpmRatio >= (idx + 1) / 13;
          const colorClass =
            idx < 5
              ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]'
              : idx < 9
                ? 'bg-amber-400 shadow-[0_0_12px_#fbbf24]'
                : 'bg-rose-500 shadow-[0_0_16px_#f43f5e]';
          return (
            <div
              key={idx}
              className={`w-6 h-2 rounded-full transition-all duration-75 ${
                lit ? colorClass : 'bg-[#161e2e] border border-[#243048]'
              }`}
            />
          );
        })}
      </div>

      {/* Main Centerpiece: Animated Tachometer & GT Car Wireframe Silhouette */}
      <div className="relative z-10 flex flex-col items-center max-w-2xl w-full px-6">
        <div className="relative w-56 h-56 flex items-center justify-center">
          {/* Outer Rotating Telemetry Ring */}
          <svg className="w-full h-full -rotate-90" viewBox="0 0 220 220">
            <defs>
              <linearGradient id="accsBootGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="55%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#f43f5e" />
              </linearGradient>
            </defs>
            {/* Background Track */}
            <circle
              cx="110"
              cy="110"
              r="94"
              fill="none"
              stroke="#172033"
              strokeWidth="8"
              strokeDasharray="440 600"
              strokeLinecap="round"
            />
            {/* Dynamic RPM Arc */}
            <circle
              cx="110"
              cy="110"
              r="94"
              fill="none"
              stroke="url(#accsBootGrad)"
              strokeWidth="8"
              strokeDasharray={`${Math.round(440 * rpmRatio)} 600`}
              strokeLinecap="round"
              className="transition-all duration-75"
            />
            {/* Inner Precision Dashed Ring */}
            <circle
              cx="110"
              cy="110"
              r="78"
              fill="none"
              stroke="#1e293b"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />
          </svg>

          {/* Tachometer Needle */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ transform: `rotate(${needleAngleDeg}deg)` }}
          >
            <div className="w-1 h-24 -translate-y-10 bg-gradient-to-t from-transparent via-rose-400 to-rose-500 rounded-full shadow-[0_0_12px_#f43f5e]" />
          </div>

          {/* Center GT Coupe Silhouette & Live RPM Readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <svg viewBox="0 0 180 64" className="w-36 h-14 mb-0.5">
              {/* Sleek GT Sportscar Silhouette */}
              <path
                d="M14 44 L24 30 L56 26 L88 12 L134 14 L158 28 L168 38 L166 46 L146 46 A12 12 0 0 0 122 46 L62 46 A12 12 0 0 0 38 46 L16 46 Z"
                fill="rgba(244, 63, 94, 0.10)"
                stroke="#38bdf8"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="420"
                strokeDashoffset={Math.round(420 * (1 - Math.min(1, progress / 65)))}
              />
              {/* Front & Rear Wheels */}
              <circle
                cx="50"
                cy="46"
                r="10"
                fill="#0b101b"
                stroke="#f43f5e"
                strokeWidth="2.2"
              />
              <circle
                cx="134"
                cy="46"
                r="10"
                fill="#0b101b"
                stroke="#f43f5e"
                strokeWidth="2.2"
              />
            </svg>
            <div className="font-mono-num text-2xl font-black tracking-tight text-white">
              {rpm.toLocaleString()}
              <span className="text-[10px] font-semibold text-rose-400 ml-1">RPM</span>
            </div>
            <div className="text-[9px] font-mono-num uppercase tracking-widest text-cyan-300">
              {progress < 100 ? 'SYSTEM CALIBRATING' : 'ENGINE READY'}
            </div>
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="text-center mt-2 mb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[10px] font-mono-num tracking-widest uppercase mb-2">
            <Gauge className="w-3.5 h-3.5 text-rose-400" />
            ASSETTO CORSA INTEGRATED VEHICLE ENGINEERING SUITE
          </div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
            AC CAR STUDIO
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            3D KN5 モデリング ・ 純正色リバリースタジオ ・ 熱力学エンジン＆管路音響シミュレーター
          </p>
        </div>

        {/* 4-Module Boot Diagnostics Checklist */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
          {BOOT_MODULES.map((mod) => {
            const Icon = mod.icon;
            const ready = progress >= mod.threshold;
            const active = progress >= mod.threshold - 22 && progress < mod.threshold;
            return (
              <div
                key={mod.id}
                className={`p-3 rounded-xl border transition-all duration-200 flex items-start gap-2.5 ${
                  ready
                    ? 'bg-[#101726]/90 border-emerald-500/40 text-slate-100'
                    : active
                      ? 'bg-[#11192a]/90 border-cyan-500/50 text-slate-200'
                      : 'bg-[#0b0f19]/60 border-[#1c2538] text-slate-500'
                }`}
              >
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    ready
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : active
                        ? 'bg-cyan-500/15 text-cyan-400'
                        : 'bg-[#141c2c] text-slate-500'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono-num text-[10px] font-bold truncate">
                      {mod.label}
                    </span>
                    {ready ? (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-mono-num text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        OK
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono-num text-cyan-400 shrink-0">
                        INIT...
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{mod.sub}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress Bar & Skip Action */}
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono-num">
            <span className="text-cyan-300">
              {progress < 100
                ? 'ワークスペースと3Dシェーダーパイプラインを初期化中...'
                : '起動完了 — スタジオを開始します'}
            </span>
            <span className="text-white font-bold">{progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#131b2b] border border-[#222f49] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 transition-all duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExiting(true);
              }}
              className="text-[11px] text-slate-400 hover:text-white bg-[#121928] hover:bg-[#1c273d] border border-[#283552] px-3 py-1 rounded-lg transition-colors"
            >
              スキップ (Click / Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
