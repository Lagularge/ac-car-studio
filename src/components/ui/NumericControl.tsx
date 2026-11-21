import React from 'react';

interface NumericControlProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  decimals?: number;
  accent?: 'rose' | 'cyan' | 'amber' | 'emerald';
}

export const NumericControl: React.FC<NumericControlProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
  hint,
  decimals = 0,
  accent = 'rose',
}) => {
  const safeValue = Number.isFinite(value) ? value : min;
  const accentClass =
    accent === 'cyan'
      ? 'accent-cyan-400'
      : accent === 'amber'
        ? 'accent-amber-400'
        : accent === 'emerald'
          ? 'accent-emerald-400'
          : 'accent-rose-500';

  return (
    <div className="bg-[#121722] border border-[#242e42] rounded-lg p-3 hover:border-[#34425e] transition-colors">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="text-xs font-medium text-slate-300 truncate">{label}</label>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number"
            value={Number(safeValue.toFixed(decimals))}
            step={step}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(v);
            }}
            className="w-24 bg-[#0b0e14] border border-[#2b354b] rounded px-2 py-0.5 text-right text-xs font-mono-num text-slate-100 focus:outline-none focus:border-rose-500"
          />
          {unit && <span className="text-[11px] text-slate-400 font-mono-num min-w-[28px]">{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, safeValue))}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-1.5 rounded-lg cursor-pointer bg-[#252e42] ${accentClass}`}
      />
      <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500 font-mono-num">
        <span>{min}{unit ? ` ${unit}` : ''}</span>
        {hint && <span className="text-slate-400 font-sans truncate mx-2">{hint}</span>}
        <span>{max}{unit ? ` ${unit}` : ''}</span>
      </div>
    </div>
  );
};
