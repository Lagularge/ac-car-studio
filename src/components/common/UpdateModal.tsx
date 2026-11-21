import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import type { AppUpdateCheckResult, AppUpdateProgressEvent } from '../../types/ac';
import { formatBytesCompact } from '../../utils/updateChecker';

interface UpdateModalProps {
  open: boolean;
  updateInfo: AppUpdateCheckResult | null;
  onClose: () => void;
  onToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  open,
  updateInfo,
  onClose,
  onToast,
}) => {
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState<AppUpdateProgressEvent | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setUpdating(false);
      setProgress(null);
      setErrorText(null);
      return;
    }
    const unsub = window.acApi.onUpdateProgress?.((ev) => {
      setProgress(ev);
    });
    return () => {
      unsub?.();
    };
  }, [open]);

  if (!open || !updateInfo) return null;

  const modeHint =
    updateInfo.installMode === 'git_pull'
      ? 'Git リポジトリから最新コードを取得して自動ビルド＆再起動します。'
      : updateInfo.downloadUrl
        ? 'GitHub Releases から最新版の Windows 実行ファイルをダウンロードして適用します。'
        : 'ブラウザで GitHub Releases ページを開きます。';

  const handleConfirmUpdate = async () => {
    setUpdating(true);
    setErrorText(null);
    setProgress({
      phase: 'downloading',
      percent: 5,
      message: 'アップデートを準備中...',
    });

    try {
      const res = await window.acApi.performAppUpdate(updateInfo);
      if (res.ok) {
        onToast(res.message, 'success');
        if (!res.restarting) {
          setUpdating(false);
          onClose();
        }
      } else {
        setErrorText(res.message);
        setUpdating(false);
        onToast(res.message, 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorText(msg);
      setUpdating(false);
      onToast(`アップデート失敗: ${msg}`, 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !updating && onClose()}
    >
      <div
        className="w-full max-w-xl bg-[#0e1421] border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-950/60 via-[#101829] to-[#101829] border-b border-[#22304a] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-emerald-950/50">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-mono-num uppercase tracking-[0.18em] text-emerald-300">
                GITHUB UPDATE AVAILABLE
              </div>
              <h2 className="text-base font-bold text-white">
                新しいアップデートが公開されています
              </h2>
            </div>
          </div>

          {!updating && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#182234] hover:bg-[#24324d] text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Version Comparison */}
          <div className="bg-[#090d16] border border-[#222f46] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 font-mono-num">
              <div>
                <div className="text-[10px] text-slate-500">現在のバージョン</div>
                <div className="text-sm font-bold text-slate-300">v{updateInfo.currentVersion}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-[10px] text-emerald-400">最新バージョン</div>
                <div className="text-sm font-bold text-emerald-300">
                  v{updateInfo.latestVersion}
                </div>
              </div>
            </div>

            <div className="text-right text-[11px] text-slate-400 font-mono-num">
              {updateInfo.publishedAt && (
                <div>公開日: {new Date(updateInfo.publishedAt).toLocaleDateString('ja-JP')}</div>
              )}
              {updateInfo.assetSizeBytes > 0 && (
                <div className="text-cyan-300">
                  サイズ: {formatBytesCompact(updateInfo.assetSizeBytes)}
                </div>
              )}
            </div>
          </div>

          {/* Release Notes */}
          <div className="space-y-1.5">
            <div className="font-semibold text-slate-200">
              更新内容 {updateInfo.releaseName ? `(${updateInfo.releaseName})` : ''}
            </div>
            <div className="bg-[#080c14] border border-[#202b40] rounded-xl p-3 max-h-48 overflow-y-auto text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
              {updateInfo.releaseNotes || 'GitHub Releases ページで詳細な変更履歴を確認できます。'}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 bg-[#0b101b] border border-[#1f2a3f] rounded-lg px-3 py-2">
            アップデートを実行しますか？ {modeHint}
          </div>

          {/* Live Progress Bar */}
          {updating && progress && (
            <div className="bg-[#080c14] border border-cyan-500/35 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-cyan-200 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  {progress.message}
                </span>
                <span className="font-mono-num text-cyan-300 font-bold">{progress.percent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#182235] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-150"
                  style={{ width: `${Math.min(100, Math.max(4, progress.percent))}%` }}
                />
              </div>
              {progress.downloadedBytes !== undefined &&
                progress.totalBytes !== undefined &&
                progress.totalBytes > 0 && (
                  <div className="text-[10px] font-mono-num text-slate-400 text-right">
                    {formatBytesCompact(progress.downloadedBytes)} /{' '}
                    {formatBytesCompact(progress.totalBytes)}
                  </div>
                )}
            </div>
          )}

          {errorText && (
            <div className="flex items-start gap-2 bg-rose-950/60 border border-rose-500/40 rounded-xl p-3 text-rose-200 text-[11px]">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorText}</span>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="px-5 py-3.5 bg-[#0a0f18] border-t border-[#1e293f] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={updating}
            onClick={() => window.acApi.openExternalUrl(updateInfo.releaseUrl)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#151e30] hover:bg-[#1e2b45] disabled:opacity-40 border border-[#283652] text-slate-200 text-xs"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            GitHubで見る
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={updating}
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#182234] hover:bg-[#23314a] disabled:opacity-40 text-slate-300 text-xs font-medium"
            >
              あとで確認する
            </button>
            <button
              type="button"
              disabled={updating}
              onClick={handleConfirmUpdate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-emerald-950/40"
            >
              {updating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  アップデート中...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  今すぐアップデートを実行
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const UpdateBadgePill: React.FC<{
  latestVersion: string;
  onClick: () => void;
}> = ({ latestVersion, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors animate-pulse"
    title="GitHub に新しいアップデートがあります。クリックして確認"
  >
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
    アップデートあり (v{latestVersion})
  </button>
);
