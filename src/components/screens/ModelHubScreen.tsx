import React from 'react';
import {
  ArrowLeft,
  BookmarkPlus,
  Box,
  ChevronRight,
  PackageCheck,
} from 'lucide-react';

export type ModelHubAction = 'model_edit' | 'model_save' | 'saved_models';

interface ModelHubScreenProps {
  carCount: number;
  savedPartCount: number;
  onSelectAction: (action: ModelHubAction) => void;
  onBackHome: () => void;
}

export const ModelHubScreen: React.FC<ModelHubScreenProps> = ({
  carCount,
  savedPartCount,
  onSelectAction,
  onBackHome,
}) => {
  const actions: Array<{
    id: ModelHubAction;
    title: string;
    en: string;
    desc: string;
    highlights: string[];
    icon: React.ReactNode;
    accent: string;
    badge: string;
    cta: string;
  }> = [
    {
      id: 'model_edit',
      title: 'モデルの改造',
      en: 'MODIFY 3D CAR MODEL',
      desc: '車両のKN5 3Dモデルを読み込み、保存済みモデルからの新規パーツ追加・モデルの差し替え・配置調整・KsEditor材質編集・KN5書き出しを行います。',
      highlights: [
        '保存済みモデルを新規パーツとして車両へ追加',
        'ホイール・エアロ・内装パーツの差し替え＆4輪一括フィット',
        '位置・回転・スケール調整、KsEditorマテリアル＆テクスチャ編集',
      ],
      icon: <Box className="w-8 h-8" />,
      accent: 'from-cyan-500 to-blue-600',
      badge: `${carCount} 台の車両`,
      cta: '車両を選んで改造を開始',
    },
    {
      id: 'model_save',
      title: 'モデルの保存',
      en: 'EXTRACT & SAVE PARTS',
      desc: '車両の3Dモデルから単体パーツまたは複数パーツをまとめて抽出し、テクスチャ＆材質ごとパーツライブラリへ保存します。',
      highlights: [
        '3Dビュー／ツリー上で Shift + 左クリック による複数パーツ同時選択',
        'パーツ選択後に Ctrl + S で素早くライブラリ保存',
        '相対位置・サイズ・使用テクスチャのみを自動で抽出してKN5保存',
      ],
      icon: <BookmarkPlus className="w-8 h-8" />,
      accent: 'from-emerald-500 to-teal-600',
      badge: 'Shift複数選択 / Ctrl+S',
      cta: '車両を選んでパーツを保存',
    },
    {
      id: 'saved_models',
      title: '保存されたモデルの確認',
      en: 'SAVED MODELS LIBRARY',
      desc: 'パーツライブラリに保存したホイール・エアロ・ステアリング・シートなどの3Dモデルを、カテゴリ別にCSP 3Dビューアで確認・管理します。',
      highlights: [
        'カテゴリ別に保存済みモデルをサムネイル＆3Dプレビュー確認',
        'サイズ・抽出元車両・ファイル容量のチェックとリネーム・削除',
        '確認画面からそのままモデル改造スタジオへ移動可能',
      ],
      icon: <PackageCheck className="w-8 h-8" />,
      accent: 'from-amber-500 to-rose-600',
      badge: `${savedPartCount} モデル保存済`,
      cta: '保存されたモデル一覧を開く',
    },
  ];

  return (
    <div className="min-h-screen w-screen bg-[#080b11] text-slate-100 flex flex-col overflow-y-auto relative">
      {/* Subtle Ambient Glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-cyan-600/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[560px] h-[560px] rounded-full bg-emerald-500/10 blur-[130px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 px-8 py-5 border-b border-[#1a2233] bg-[#0b0f18]/85 backdrop-blur-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackHome}
            className="flex items-center gap-1.5 bg-[#161e2e] hover:bg-[#202c44] border border-[#2b3854] text-slate-200 text-xs px-3.5 py-2 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            ホームへ戻る
          </button>
          <div className="h-6 w-px bg-[#242e42]" />
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Box className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-wide">
                モデル改造・パーツ管理メニュー
              </h1>
              <p className="text-[11px] text-slate-400">
                3D Model Modification • Multi-Part Extractor • Saved Models Library
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono-num">
          <span className="px-3 py-1.5 rounded-xl bg-[#111724] border border-[#232e44] text-cyan-300">
            車両 {carCount} 台
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-[#111724] border border-[#232e44] text-emerald-300">
            保存モデル {savedPartCount} 件
          </span>
        </div>
      </header>

      {/* Main 3-Choice Hub */}
      <main className="relative z-10 flex-1 flex flex-col justify-center max-w-6xl w-full mx-auto px-8 py-10">
        <div className="mb-8">
          <div className="text-xs font-mono-num uppercase tracking-[0.22em] text-cyan-400 mb-1.5">
            3D MODEL WORKFLOW
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            モデルに関する作業を選択してください
          </h2>
          <p className="text-sm text-slate-400 mt-1.5">
            モデルの改造・複数パーツの抽出保存・保存済みモデルの3D確認から作業を選べます。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {actions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectAction(item.id)}
              className="group relative text-left bg-[#101622]/90 hover:bg-[#151e30] border border-[#222d42] hover:border-slate-500/70 rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 shadow-xl hover:shadow-2xl flex flex-col justify-between min-h-[300px] overflow-hidden"
            >
              <div
                className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${item.accent} opacity-80 group-hover:opacity-100 transition-opacity`}
              />

              <div>
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.accent} flex items-center justify-center text-white shadow-lg`}
                  >
                    {item.icon}
                  </div>
                  <span className="text-[11px] font-mono-num px-2.5 py-1 rounded-full bg-[#090d15] border border-[#27334b] text-slate-300">
                    {item.badge}
                  </span>
                </div>

                <div className="text-[10px] font-mono-num tracking-[0.18em] text-slate-500 uppercase">
                  {item.en}
                </div>
                <h3 className="text-2xl font-bold text-white mt-0.5 group-hover:text-cyan-200 transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">{item.desc}</p>

                <ul className="mt-4 space-y-1.5 text-[11px] text-slate-300">
                  {item.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 pt-3.5 border-t border-[#1c2538] flex items-center justify-between text-xs font-semibold text-slate-200 group-hover:text-white">
                <span>{item.cta}</span>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
};
