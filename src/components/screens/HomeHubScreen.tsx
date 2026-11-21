import React from 'react';
import {
  Box,
  Car,
  ChevronRight,
  Download,
  FolderOpen,
  Paintbrush,
  PlusCircle,
  Server,
  Settings,
  Sliders,
  Sparkles,
  Volume2,
} from 'lucide-react';

export type WorkModeId =
  | 'create_mod'
  | 'model_edit'
  | 'paint'
  | 'engine_sim'
  | 'car_tuning'
  | 'server_setup'
  | 'settings';

interface HomeHubScreenProps {
  carsDir: string | null;
  carCount: number;
  savedPartCount: number;
  appVersion: string;
  availableUpdateVersion: string | null;
  onOpenUpdateModal: () => void;
  onSelectMode: (mode: WorkModeId) => void;
  onPickFolder: () => void;
  onUseDemo: () => void;
}

export const HomeHubScreen: React.FC<HomeHubScreenProps> = ({
  carsDir,
  carCount,
  savedPartCount,
  appVersion,
  availableUpdateVersion,
  onOpenUpdateModal,
  onSelectMode,
  onPickFolder,
  onUseDemo,
}) => {
  const cards: Array<{
    id: WorkModeId;
    title: string;
    en: string;
    desc: string;
    icon: React.ReactNode;
    accent: string;
    badge?: string;
  }> = [
    {
      id: 'create_mod',
      title: 'Mod作成',
      en: 'CREATE NEW MOD',
      desc: 'FRスポーツ・ドリフト・AWD・GT3等のテンプレートから、新しいAssetto Corsa車両Mod一式を生成します。',
      icon: <PlusCircle className="w-7 h-7" />,
      accent: 'from-rose-500 to-orange-500',
      badge: '5テンプレート',
    },
    {
      id: 'model_edit',
      title: 'モデル改造',
      en: '3D MODEL & PARTS HUB',
      desc: '「モデルの改造」「モデルの保存（複数選択＆Ctrl+S）」「保存されたモデルの確認」から作業を選んで3Dパーツ編集を行います。',
      icon: <Box className="w-7 h-7" />,
      accent: 'from-cyan-500 to-blue-600',
      badge: `改造・保存・確認 (${savedPartCount})`,
    },
    {
      id: 'paint',
      title: 'ペイント / スキン',
      en: '3D LIVERY STUDIO',
      desc: 'GT7風の3Dモデル直接投影デカール、純正色・内装素材プリセット、4K/8K高精細スキン書き出しを行います。',
      icon: <Paintbrush className="w-7 h-7" />,
      accent: 'from-fuchsia-500 to-rose-500',
      badge: 'GT7式3D投影 & 4K対応',
    },
    {
      id: 'engine_sim',
      title: 'エンジン音シミュレーター',
      en: 'PHYSICAL ENGINE SOUND SIM',
      desc: '熱力学・1次元管路音響・マフラー揺れ・機械駆動音・車内防音NVHからエンジン音を合成し、Assetto Corsaへ直接反映します。',
      icon: <Volume2 className="w-7 h-7" />,
      accent: 'from-violet-500 to-cyan-500',
      badge: '物理音響 & AC直接反映',
    },
    {
      id: 'car_tuning',
      title: '車両データ改造',
      en: 'CAR PHYSICS & CSP POWERTRAIN',
      desc: '出力・ターボ、CSP AT/CVT実装、ハイブリッドモーター＆回生ブレーキ、3Dサスペンション、data.acd展開/再パックを行います。',
      icon: <Sliders className="w-7 h-7" />,
      accent: 'from-amber-500 to-rose-600',
      badge: 'AT/CVT・HV・物理',
    },
    {
      id: 'server_setup',
      title: 'ACサーバー設定',
      en: 'DEDICATED SERVER & CSP RULES',
      desc: 'server_cfg.ini / entry_list.ini / CSP拡張ルールを視覚的に設定し、acServer.exe の起動・ライブログ監視・招待リンク生成を行います。',
      icon: <Server className="w-7 h-7" />,
      accent: 'from-emerald-500 to-teal-600',
      badge: 'acServer & CSP対応',
    },
    {
      id: 'settings',
      title: '設定',
      en: 'SETTINGS & WORKSPACE',
      desc: 'Assetto Corsaフォルダ、スキン既定解像度(1K〜8K)、自動UI調整、起動アニメーション、自動バックアップを設定します。',
      icon: <Settings className="w-7 h-7" />,
      accent: 'from-slate-500 to-slate-700',
      badge: carsDir ? `${carCount} 台認識中` : 'フォルダ未設定',
    },
  ];

  return (
    <div className="min-h-screen w-screen bg-[#080b11] text-slate-100 flex flex-col overflow-y-auto relative">
      {/* Subtle Motorsport Ambient Glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-rose-600/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[560px] h-[560px] rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 px-8 py-6 border-b border-[#1a2233] bg-[#0b0f18]/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <img
            src="./icon.png"
            alt="AC Car Studio"
            className="w-11 h-11 rounded-2xl object-cover border border-white/15 shadow-lg shadow-rose-500/20 bg-black"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-wider text-white">AC CAR STUDIO</h1>
              <span className="text-[10px] font-mono-num px-2 py-0.5 rounded-full bg-[#141c2c] border border-[#27344f] text-slate-300">
                v{appVersion}
              </span>
            </div>
            <p className="text-xs text-slate-400 tracking-wide">
              Assetto Corsa Vehicle Creator • CSP 3D Showroom • Engine-Sim Workbench
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {availableUpdateVersion && (
            <button
              type="button"
              onClick={onOpenUpdateModal}
              className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-200 font-semibold px-3.5 py-2 rounded-xl transition-colors"
              title="GitHub に新しいアップデートがあります。クリックして確認"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              アップデートあり (v{availableUpdateVersion})
            </button>
          )}
          <div className="flex items-center gap-2 bg-[#111724] border border-[#232e44] rounded-xl px-3.5 py-2">
            <Car className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="max-w-[320px] truncate font-mono-num text-slate-300" title={carsDir ?? ''}>
              {carsDir ? `${carsDir} (${carCount}台)` : 'content/cars 未選択'}
            </div>
          </div>
          <button
            onClick={onPickFolder}
            className="flex items-center gap-1.5 bg-[#161e2e] hover:bg-[#202c44] border border-[#2b3854] text-slate-200 px-3.5 py-2 rounded-xl transition-colors"
          >
            <FolderOpen className="w-4 h-4 text-amber-400" />
            ACフォルダ変更
          </button>
          <button
            onClick={onUseDemo}
            className="flex items-center gap-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-200 px-3.5 py-2 rounded-xl transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            デモ車両を開く
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col justify-center max-w-7xl w-full mx-auto px-8 py-10">
        <div className="mb-8">
          <div className="text-xs font-mono-num uppercase tracking-[0.22em] text-rose-400 mb-1.5">
            SELECT WORKSPACE MODE
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            行う作業を選択してください
          </h2>
          <p className="text-sm text-slate-400 mt-1.5">
            作業を選ぶと、CSP スタイルの大画面ガレージから車両を選んで編集を開始できます。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => onSelectMode(card.id)}
              className="group relative text-left bg-[#101622]/90 hover:bg-[#151d2e] border border-[#222d42] hover:border-slate-500/70 rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 shadow-xl hover:shadow-2xl flex flex-col justify-between min-h-[210px] overflow-hidden"
            >
              {/* Top Accent Strip */}
              <div
                className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.accent} opacity-75 group-hover:opacity-100 transition-opacity`}
              />

              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div
                    className={`w-13 h-13 rounded-2xl bg-gradient-to-br ${card.accent} flex items-center justify-center text-white shadow-lg`}
                  >
                    {card.icon}
                  </div>
                  {card.badge && (
                    <span className="text-[11px] font-mono-num px-2.5 py-1 rounded-full bg-[#090d15] border border-[#27334b] text-slate-300">
                      {card.badge}
                    </span>
                  )}
                </div>

                <div className="text-[10px] font-mono-num tracking-[0.18em] text-slate-500 uppercase">
                  {card.en}
                </div>
                <h3 className="text-xl font-bold text-white mt-0.5 group-hover:text-rose-200 transition-colors">
                  {card.title}
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">{card.desc}</p>
              </div>

              <div className="mt-5 pt-3 border-t border-[#1c2538] flex items-center justify-between text-xs font-semibold text-slate-300 group-hover:text-white">
                <span>作業を開く</span>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-rose-400 group-hover:translate-x-1 transition-all" />
              </div>
            </button>
          ))}
        </div>

        {!carsDir && (
          <div className="mt-8 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
            <div>
              <strong>Assetto Corsa のフォルダが未設定です。</strong> 右上の「ACフォルダ変更」から{' '}
              <code className="text-amber-100">assettocorsa/content/cars</code> を選択するか、「デモ車両を開く」ですぐにお試しいただけます。
            </div>
            <button
              onClick={onUseDemo}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-1.5 rounded-lg"
            >
              デモ車両 (3台) を今すぐ作成
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
