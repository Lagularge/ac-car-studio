import React from 'react';
import {
  ArrowLeft,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Monitor,
  Play,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { CspLightingPreset } from '../../utils/cspRenderer';
import type { SkinExportResolution } from '../../utils/liveryEngine';

export interface AppSettingsState {
  defaultAutoBackup: boolean;
  defaultRepackAcd: boolean;
  defaultCspLighting: CspLightingPreset;
  defaultSkinResolution: SkinExportResolution;
  autoUiScale: boolean;
  manualUiScale: number;
  enableStartupAnimation: boolean;
}

interface SettingsScreenProps {
  carsDir: string | null;
  carCount: number;
  savedPartCount: number;
  customPresetCount: number;
  settings: AppSettingsState;
  windowWidth: number;
  windowHeight: number;
  effectiveUiScale: number;
  onUpdateSettings: (patch: Partial<AppSettingsState>) => void;
  onPlayStartupAnimation: () => void;
  onPickFolder: () => void;
  onDetectFolder: () => void;
  onUseDemo: () => void;
  onBackHome: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  carsDir,
  carCount,
  savedPartCount,
  customPresetCount,
  settings,
  windowWidth,
  windowHeight,
  effectiveUiScale,
  onUpdateSettings,
  onPlayStartupAnimation,
  onPickFolder,
  onDetectFolder,
  onUseDemo,
  onBackHome,
}) => {
  return (
    <div className="h-screen w-screen bg-[#080b11] text-slate-100 flex flex-col overflow-hidden">
      <header className="px-6 py-4 bg-[#0d121d] border-b border-[#1f283b] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackHome}
            className="flex items-center gap-1.5 bg-[#182132] hover:bg-[#23304a] border border-[#2a3650] text-slate-200 text-xs px-3 py-1.5 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            ホームへ戻る
          </button>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <h1 className="text-base font-bold text-white">アプリ設定 &amp; ワークスペース管理</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-5 text-xs">
          {/* AC Folder Config */}
          <section className="bg-[#121722] border border-[#242e42] rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
              <HardDrive className="w-4 h-4 text-amber-400" />
              Assetto Corsa 車両フォルダ (content/cars)
            </div>

            <div className="bg-[#090c11] border border-[#232d42] rounded-xl px-4 py-3 font-mono-num text-slate-200 break-all">
              {carsDir || '未設定'}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={onPickFolder}
                className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold px-4 py-2 rounded-xl"
              >
                <FolderOpen className="w-4 h-4" />
                フォルダを手動選択
              </button>
              <button
                onClick={onDetectFolder}
                className="flex items-center gap-1.5 bg-[#1b2436] hover:bg-[#26324c] text-cyan-300 border border-cyan-500/30 px-4 py-2 rounded-xl"
              >
                <RefreshCw className="w-4 h-4" />
                Steamから自動検出
              </button>
              <button
                onClick={onUseDemo}
                className="flex items-center gap-1.5 bg-[#1b2436] hover:bg-[#26324c] text-amber-300 border border-amber-500/30 px-4 py-2 rounded-xl"
              >
                <Sparkles className="w-4 h-4" />
                デモ用車両ワークスペースを開く
              </button>
            </div>
          </section>

          {/* Save & Data Behavior */}
          <section className="bg-[#121722] border border-[#242e42] rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
              <Save className="w-4 h-4 text-emerald-400" />
              保存 &amp; data.acd デフォルト動作
            </div>

            <label className="flex items-center justify-between bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3.5 cursor-pointer">
              <div>
                <div className="font-semibold text-slate-200">保存前に自動バックアップを作成</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  物理データを保存する際、毎回 `_ac_studio_backups` へ復元ポイントを自動保存します。
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.defaultAutoBackup}
                onChange={(e) => onUpdateSettings({ defaultAutoBackup: e.target.checked })}
                className="accent-emerald-500 w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3.5 cursor-pointer">
              <div>
                <div className="font-semibold text-slate-200">data.acd を持つ車両は保存時に自動再パック</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  元の車両が `data.acd` 形式だった場合、AC実機へ確実に変更を反映するため自動で再パックをONにします。
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.defaultRepackAcd}
                onChange={(e) => onUpdateSettings({ defaultRepackAcd: e.target.checked })}
                className="accent-amber-500 w-4 h-4"
              />
            </label>
          </section>

          {/* Default Livery Skin Resolution */}
          <section className="bg-[#121722] border border-[#242e42] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <ImageIcon className="w-4 h-4 text-rose-400" />
                スキン作成 既定テクスチャ解像度 (Livery Studio)
              </div>
              <span className="font-mono-num text-[11px] px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/35 text-rose-200">
                現在: {settings.defaultSkinResolution}×{settings.defaultSkinResolution} px
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(
                [
                  [1024, '1024 px', '1024×1024', '軽量・高速書き出し（省メモリ・試作向け）'],
                  [2048, '2048 px', '2048×2048', '標準高精細（画質と容量のバランス重視）'],
                  [4096, '4096 px (標準)', '4096×4096', '既定 4K高精細（AC/CSP本番スキン推奨）'],
                  [8192, '8192 px (8K)', '8192×8192', '極限8K超高精細（超精密ロゴ・撮影向け）'],
                ] as Array<[SkinExportResolution, string, string, string]>
              ).map(([res, title, dims, sub]) => {
                const active = settings.defaultSkinResolution === res;
                return (
                  <button
                    key={res}
                    type="button"
                    onClick={() => onUpdateSettings({ defaultSkinResolution: res })}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      active
                        ? 'bg-rose-500/15 border-rose-500 text-rose-100 shadow-md shadow-rose-500/10'
                        : 'bg-[#0b0e14] border-[#242e42] text-slate-300 hover:border-[#3a4968]'
                    }`}
                  >
                    <div className="font-bold text-xs">{title}</div>
                    <div className="font-mono-num text-[10px] text-cyan-300 mt-0.5">{dims}</div>
                    <div className="text-[10px] text-slate-400 mt-1 leading-snug">{sub}</div>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              ※ 3Dビューワー編集時は快適な動作のため最大2048pxでリアルタイム表示し、スキン保存（DDS / PNG書き出し）時にここで選択した実解像度（例: 4096×4096 / 8192×8192）で高精細レンダリングして出力します。テクスチャ編集タブからマテリアル単位での個別変更も可能です。
            </p>
          </section>

          {/* Auto UI Scaling & Startup Animation */}
          <section className="bg-[#121722] border border-[#242e42] rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <Monitor className="w-4 h-4 text-cyan-400" />
                自動UI調整 &amp; 起動アニメーション
              </div>
              <span className="font-mono-num text-[11px] px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/35 text-cyan-200">
                現在: {Math.round(effectiveUiScale * 100)}% ({windowWidth}×{windowHeight})
              </span>
            </div>

            <label className="flex items-center justify-between bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3.5 cursor-pointer">
              <div>
                <div className="font-semibold text-slate-200">ウィンドウサイズ連動・自動UI調整</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  ウィンドウの縦横サイズに合わせてUIスケールと文字サイズを自動最適化します。
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.autoUiScale}
                onChange={(e) => onUpdateSettings({ autoUiScale: e.target.checked })}
                className="accent-cyan-500 w-4 h-4"
              />
            </label>

            <div className="bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">手動UIズーム倍率</span>
                <span className="font-mono-num text-[11px] text-cyan-300">
                  {settings.autoUiScale
                    ? `自動 (${Math.round(effectiveUiScale * 100)}%)`
                    : `${Math.round(settings.manualUiScale * 100)}%`}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[0.8, 0.9, 1.0, 1.1, 1.2].map((sc) => {
                  const active = !settings.autoUiScale && Math.abs(settings.manualUiScale - sc) < 0.02;
                  return (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => onUpdateSettings({ autoUiScale: false, manualUiScale: sc })}
                      className={`py-1.5 rounded-lg border font-mono-num text-xs transition-colors ${
                        active
                          ? 'bg-cyan-600 border-cyan-400 text-white font-bold'
                          : 'bg-[#141b29] border-[#26324a] text-slate-300 hover:border-[#3c4e72] hover:text-white'
                      }`}
                    >
                      {Math.round(sc * 100)}%
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3.5">
              <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-[220px]">
                <input
                  type="checkbox"
                  checked={settings.enableStartupAnimation}
                  onChange={(e) => onUpdateSettings({ enableStartupAnimation: e.target.checked })}
                  className="accent-rose-500 w-4 h-4"
                />
                <div>
                  <div className="font-semibold text-slate-200">ソフト起動時に起動アニメーションを表示</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    起動時のスプラッシュ演出のON/OFFを切り替えます。
                  </div>
                </div>
              </label>
              <button
                type="button"
                onClick={onPlayStartupAnimation}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-200 font-semibold text-xs shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                起動アニメーションを再生
              </button>
            </div>
          </section>

          {/* CSP 3D Viewport Preset */}
          <section className="bg-[#121722] border border-[#242e42] rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
              <Sun className="w-4 h-4 text-cyan-400" />
              CSP ベース 3D ショールーム既定ライティング
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(
                [
                  ['csp_showroom', 'CSP Showroom', '明るいソフトボックス照明・塗装ツヤ確認向け'],
                  ['csp_sunset', 'CSP Sunset Track', '夕暮れサーキット反射・ボディライン確認向け'],
                  ['csp_studio_dark', 'CSP Dark Studio', '暗室スポット照明・発光ライト確認向け'],
                ] as Array<[CspLightingPreset, string, string]>
              ).map(([id, title, sub]) => (
                <button
                  key={id}
                  onClick={() => onUpdateSettings({ defaultCspLighting: id })}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    settings.defaultCspLighting === id
                      ? 'bg-cyan-500/15 border-cyan-500 text-cyan-100'
                      : 'bg-[#0b0e14] border-[#242e42] text-slate-300 hover:border-[#3a4968]'
                  }`}
                >
                  <div className="font-semibold">{title}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{sub}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Workspace Stats */}
          <section className="bg-[#121722] border border-[#242e42] rounded-2xl p-5">
            <div className="text-sm font-bold text-slate-100 mb-3">ワークスペース統計</div>
            <div className="grid grid-cols-3 gap-3 font-mono-num">
              <div className="bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3 text-center">
                <div className="text-slate-400 text-[11px]">検出車両数</div>
                <div className="text-2xl font-bold text-cyan-300 mt-1">{carCount}</div>
              </div>
              <div className="bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3 text-center">
                <div className="text-slate-400 text-[11px]">保存パーツ数</div>
                <div className="text-2xl font-bold text-emerald-300 mt-1">{savedPartCount}</div>
              </div>
              <div className="bg-[#0b0e14] border border-[#222b3e] rounded-xl p-3 text-center">
                <div className="text-slate-400 text-[11px]">カスタムプリセット</div>
                <div className="text-2xl font-bold text-amber-300 mt-1">{customPresetCount}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
