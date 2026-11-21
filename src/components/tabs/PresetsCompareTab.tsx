import React, { useMemo, useState } from 'react';
import {
  BookmarkPlus,
  GitCompare,
  Layers,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  BackupEntry,
  CarPhysicsMetrics,
  CarSummary,
  CustomPresetRecord,
} from '../../types/ac';
import { getIniNumber, getIniValue } from '../../utils/iniHelpers';
import { computeCarPhysics } from '../../utils/physicsCalc';
import {
  BUILTIN_PRESETS,
  applyCustomPreset,
  extractCustomPresetSnapshot,
} from '../../utils/presets';
import { DynoChart } from '../charts/DynoChart';

interface PresetsCompareTabProps {
  carsDir: string;
  carId: string;
  cars: CarSummary[];
  backups: BackupEntry[];
  files: Record<string, string>;
  originalFiles: Record<string, string>;
  metrics: CarPhysicsMetrics;
  customPresets: CustomPresetRecord[];
  onReplaceAllFiles: (nextFiles: Record<string, string>, toastMsg: string) => void;
  onSaveCustomPresets: (next: CustomPresetRecord[]) => void;
}

export const PresetsCompareTab: React.FC<PresetsCompareTabProps> = ({
  carsDir,
  carId,
  cars,
  backups,
  files,
  originalFiles,
  metrics,
  customPresets,
  onReplaceAllFiles,
  onSaveCustomPresets,
}) => {
  // Custom preset form
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');

  // Compare state
  const [compareMode, setCompareMode] = useState<'original' | 'car' | 'backup'>('original');
  const [compareCarId, setCompareCarId] = useState<string>('');
  const [compareBackupId, setCompareBackupId] = useState<string>('');
  const [compareFiles, setCompareFiles] = useState<Record<string, string> | null>(null);
  const [compareLabel, setCompareLabel] = useState('編集前 (オリジナル)');
  const [loadingCompare, setLoadingCompare] = useState(false);

  const effectiveCompareFiles = compareMode === 'original' ? originalFiles : compareFiles;

  const compareMetrics = useMemo(() => {
    if (!effectiveCompareFiles || Object.keys(effectiveCompareFiles).length === 0) return null;
    return computeCarPhysics(effectiveCompareFiles);
  }, [effectiveCompareFiles]);

  const handleSelectCompareCar = async (targetId: string) => {
    setCompareCarId(targetId);
    if (!targetId) return;
    setLoadingCompare(true);
    try {
      const loaded = await window.acApi.loadCar(carsDir, targetId);
      setCompareFiles(loaded.files);
      setCompareLabel(loaded.summary.name);
      setCompareMode('car');
    } catch {
      setCompareFiles(null);
    } finally {
      setLoadingCompare(false);
    }
  };

  const handleSelectCompareBackup = async (backupId: string) => {
    setCompareBackupId(backupId);
    if (!backupId) return;
    setLoadingCompare(true);
    try {
      const data = await window.acApi.loadBackupData(carsDir, carId, backupId);
      const b = backups.find((x) => x.id === backupId);
      setCompareFiles(data);
      setCompareLabel(`Backup: ${b?.note || backupId}`);
      setCompareMode('backup');
    } catch {
      setCompareFiles(null);
    } finally {
      setLoadingCompare(false);
    }
  };

  const handleCreateCustomPreset = () => {
    if (!presetName.trim()) return;
    const snap = extractCustomPresetSnapshot(files, presetName, presetDesc);
    const next = [snap, ...customPresets];
    onSaveCustomPresets(next);
    setPresetName('');
    setPresetDesc('');
  };

  const handleDeleteCustomPreset = (id: string) => {
    onSaveCustomPresets(customPresets.filter((p) => p.id !== id));
  };

  const badgeColors: Record<string, string> = {
    drift: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    grip: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    engine: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    chassis: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    street: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  };

  // Comparison metric rows
  const diffRows = useMemo(() => {
    if (!compareMetrics || !effectiveCompareFiles) return [];
    const curFiles = files;
    const cmpFiles = effectiveCompareFiles;

    const numDiff = (cur: number, cmp: number, unit: string, higherIsBetter = true, dec = 1) => {
      const delta = cur - cmp;
      const sign = delta > 0 ? '+' : '';
      const good = higherIsBetter ? delta > 0 : delta < 0;
      return {
        curStr: `${cur.toFixed(dec)} ${unit}`,
        cmpStr: `${cmp.toFixed(dec)} ${unit}`,
        deltaStr: Math.abs(delta) < 0.005 ? '±0' : `${sign}${delta.toFixed(dec)} ${unit}`,
        deltaColor:
          Math.abs(delta) < 0.005
            ? 'text-slate-500'
            : good
              ? 'text-emerald-400'
              : 'text-rose-400',
      };
    };

    return [
      {
        label: '最大出力 (PS)',
        ...numDiff(metrics.peakPowerPs, compareMetrics.peakPowerPs, 'PS', true, 1),
      },
      {
        label: '最大トルク (Nm)',
        ...numDiff(metrics.peakTorqueNm, compareMetrics.peakTorqueNm, 'Nm', true, 1),
      },
      {
        label: '車両重量 (kg)',
        ...numDiff(metrics.massKg, compareMetrics.massKg, 'kg', false, 0),
      },
      {
        label: 'パワーウェイトレシオ',
        ...numDiff(metrics.powerToWeightKgPerPs, compareMetrics.powerToWeightKgPerPs, 'kg/PS', false, 2),
      },
      {
        label: '推定最高速',
        ...numDiff(metrics.estimatedTopSpeedKmh, compareMetrics.estimatedTopSpeedKmh, 'km/h', true, 1),
      },
      {
        label: '推定 0-100 km/h',
        ...numDiff(metrics.estimated0To100Sec, compareMetrics.estimated0To100Sec, 'sec', false, 1),
      },
      {
        label: '最大ターボブースト',
        ...numDiff(metrics.maxBoostBar, compareMetrics.maxBoostBar, 'bar', true, 2),
      },
      {
        label: 'フロントバネレート',
        ...numDiff(
          getIniNumber(curFiles['suspensions.ini'], 'FRONT', 'SPRING_RATE', 0) / 1000,
          getIniNumber(cmpFiles['suspensions.ini'], 'FRONT', 'SPRING_RATE', 0) / 1000,
          'kN/m',
          true,
          1
        ),
      },
      {
        label: 'リアタイヤ横グリップ (DY)',
        ...numDiff(
          getIniNumber(curFiles['tyres.ini'], 'REAR', 'DY_REF', getIniNumber(curFiles['tyres.ini'], 'REAR', 'DY0', 1.25)),
          getIniNumber(cmpFiles['tyres.ini'], 'REAR', 'DY_REF', getIniNumber(cmpFiles['tyres.ini'], 'REAR', 'DY0', 1.25)),
          '',
          true,
          3
        ),
      },
      {
        label: 'LSD Power ロック率',
        ...numDiff(
          getIniNumber(curFiles['drivetrain.ini'], 'DIFFERENTIAL', 'POWER', 0) * 100,
          getIniNumber(cmpFiles['drivetrain.ini'], 'DIFFERENTIAL', 'POWER', 0) * 100,
          '%',
          true,
          0
        ),
      },
      {
        label: '駆動方式',
        curStr: getIniValue(curFiles['drivetrain.ini'], 'TRACTION', 'TYPE', 'RWD'),
        cmpStr: getIniValue(cmpFiles['drivetrain.ini'], 'TRACTION', 'TYPE', 'RWD'),
        deltaStr:
          getIniValue(curFiles['drivetrain.ini'], 'TRACTION', 'TYPE', 'RWD') ===
          getIniValue(cmpFiles['drivetrain.ini'], 'TRACTION', 'TYPE', 'RWD')
            ? '同一'
            : '変更あり',
        deltaColor: 'text-cyan-300',
      },
    ];
  }, [metrics, compareMetrics, files, effectiveCompareFiles]);

  return (
    <div className="space-y-6">
      {/* Built-in Tuning Presets */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            ワンクリック・チューニングコンバージョンプリセット
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {BUILTIN_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="bg-[#121722] border border-[#242e42] hover:border-[#374664] rounded-xl p-4 flex flex-col justify-between transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-slate-100">{preset.name}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeColors[preset.category]}`}
                  >
                    {preset.badge}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">{preset.description}</p>
                <ul className="space-y-1 mb-4">
                  {preset.highlights.map((h) => (
                    <li key={h} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() =>
                  onReplaceAllFiles(
                    preset.apply(files),
                    `プリセット「${preset.name}」を適用しました（まだ未保存です）`
                  )
                }
                className="w-full flex items-center justify-center gap-1.5 bg-[#1b2436] hover:bg-rose-600 text-slate-200 hover:text-white border border-[#2d3b56] hover:border-rose-500 text-xs font-medium py-2 rounded-lg transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                このプリセットを適用
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Presets Manager */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-100">マイ・カスタムプリセット管理</h3>
        </div>

        <div className="flex flex-wrap gap-2 items-center bg-[#0b0e14] border border-[#212a3d] rounded-lg p-3">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="プリセット名 (例: 筑波アタック用足回り)"
            className="flex-1 min-w-[200px] bg-[#121722] border border-[#2b354b] rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
          />
          <input
            type="text"
            value={presetDesc}
            onChange={(e) => setPresetDesc(e.target.value)}
            placeholder="メモ (任意)"
            className="flex-1 min-w-[200px] bg-[#121722] border border-[#2b354b] rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleCreateCustomPreset}
            disabled={!presetName.trim()}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            現在の設定を保存
          </button>
        </div>

        {customPresets.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-3">
            カスタムプリセットはまだありません。お気に入りの足回り・デフ・タイヤ設定を保存して別車両へ移植できます。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {customPresets.map((cp) => (
              <div
                key={cp.id}
                className="bg-[#0e131d] border border-[#252f44] rounded-lg p-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-emerald-300">{cp.name}</span>
                    <button
                      onClick={() => handleDeleteCustomPreset(cp.id)}
                      className="text-slate-500 hover:text-rose-400"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 mb-2">{cp.description}</p>
                </div>
                <button
                  onClick={() =>
                    onReplaceAllFiles(
                      applyCustomPreset(files, cp),
                      `カスタムプリセット「${cp.name}」を適用しました`
                    )
                  }
                  className="w-full bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/30 text-xs py-1.5 rounded-md transition-colors"
                >
                  この車両に適用
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Setup Comparison */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              セットアップ &amp; パフォーマンス比較スタジオ
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => {
                setCompareMode('original');
                setCompareLabel('編集前 (オリジナル)');
              }}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                compareMode === 'original'
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                  : 'bg-[#0b0e14] border-[#252e42] text-slate-400 hover:text-slate-200'
              }`}
            >
              編集前と比較
            </button>

            <select
              value={compareMode === 'car' ? compareCarId : ''}
              onChange={(e) => handleSelectCompareCar(e.target.value)}
              className="bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-1.5 text-slate-200 max-w-[220px]"
            >
              <option value="">別の車両と比較...</option>
              {cars
                .filter((c) => c.id !== carId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>

            <select
              value={compareMode === 'backup' ? compareBackupId : ''}
              onChange={(e) => handleSelectCompareBackup(e.target.value)}
              className="bg-[#0b0e14] border border-[#2b354b] rounded-lg px-2.5 py-1.5 text-slate-200 max-w-[220px]"
              disabled={backups.length === 0}
            >
              <option value="">
                {backups.length === 0 ? 'バックアップなし' : 'バックアップと比較...'}
              </option>
              {backups.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} — {b.note}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadingCompare ? (
          <div className="text-center py-8 text-xs text-slate-400">比較データを読み込み中...</div>
        ) : compareMetrics ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-[#0e131d] border border-[#212a3d] rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-2">
                ダイノグラフ重ね合わせ: <span className="text-rose-400 font-medium">現在編集中</span> vs{' '}
                <span className="text-sky-400 font-medium">{compareLabel}</span>
              </div>
              <DynoChart
                curve={metrics.dynoCurve}
                compareCurve={compareMetrics.dynoCurve}
                compareLabel={compareLabel}
                height={280}
              />
            </div>

            <div className="bg-[#0e131d] border border-[#212a3d] rounded-lg p-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-[#242e42]">
                    <th className="text-left py-2 px-2">項目</th>
                    <th className="text-right py-2 px-2 text-rose-300">現在の設定</th>
                    <th className="text-right py-2 px-2 text-sky-300">{compareLabel}</th>
                    <th className="text-right py-2 px-2">差分</th>
                  </tr>
                </thead>
                <tbody className="font-mono-num divide-y divide-[#1a2232]">
                  {diffRows.map((row) => (
                    <tr key={row.label} className="hover:bg-[#151c2a]">
                      <td className="py-1.5 px-2 font-sans text-slate-300">{row.label}</td>
                      <td className="py-1.5 px-2 text-right text-slate-100">{row.curStr}</td>
                      <td className="py-1.5 px-2 text-right text-slate-400">{row.cmpStr}</td>
                      <td className={`py-1.5 px-2 text-right font-semibold ${row.deltaColor}`}>
                        {row.deltaStr}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-xs text-slate-500">比較対象を選択してください。</div>
        )}
      </div>
    </div>
  );
};
