import React, { useState } from 'react';
import { Archive, History, RotateCcw, Trash2, X } from 'lucide-react';
import type { BackupEntry } from '../types/ac';

interface BackupModalProps {
  open: boolean;
  carName: string;
  backups: BackupEntry[];
  onClose: () => void;
  onCreateBackup: (note: string) => Promise<void>;
  onRestoreBackup: (backupId: string) => Promise<void>;
  onDeleteBackup: (backupId: string) => Promise<void>;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  open,
  carName,
  backups,
  onClose,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
}) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    setBusy(true);
    try {
      await onCreateBackup(note.trim() || '手動スナップショット');
      setNote('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121722] border border-[#2a354d] rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#222b3e]">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100">バックアップ &amp; 復元マネージャー</h2>
              <p className="text-[11px] text-slate-400">{carName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Create new backup */}
          <div className="flex gap-2 bg-[#0b0e14] border border-[#212a3d] rounded-xl p-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="バックアップメモ (例: ノーマル純正状態 / ターボ変更前)"
              className="flex-1 bg-[#121722] border border-[#2b354b] rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleCreate}
              disabled={busy}
              className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium px-3.5 py-1.5 rounded-lg shrink-0"
            >
              <Archive className="w-3.5 h-3.5" />
              今すぐ作成
            </button>
          </div>

          {/* List */}
          {backups.length === 0 ? (
            <div className="text-center py-8 text-slate-500 border border-dashed border-[#242e42] rounded-xl">
              まだバックアップがありません。チューニング前に純正データを保存しておくことをおすすめします。
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="bg-[#0e131d] border border-[#242e42] rounded-xl p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-200 truncate">{b.note}</div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono-num">
                      <span>{b.id}</span>
                      <span>•</span>
                      <span>{b.fileCount} files</span>
                      {b.hasDataFolder && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300">
                          data/
                        </span>
                      )}
                      {b.hasDataAcd && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300">
                          data.acd
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onRestoreBackup(b.id)}
                      className="flex items-center gap-1 bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      復元
                    </button>
                    <button
                      onClick={() => onDeleteBackup(b.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10"
                      title="バックアップを削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
