import React, { useMemo, useState } from 'react';
import { FileCode2, Plus, Search } from 'lucide-react';

interface RawEditorTabProps {
  files: Record<string, string>;
  originalFiles: Record<string, string>;
  onUpdateFile: (fileName: string, content: string) => void;
}

export const RawEditorTab: React.FC<RawEditorTabProps> = ({
  files,
  originalFiles,
  onUpdateFile,
}) => {
  const fileNames = useMemo(() => Object.keys(files).sort((a, b) => a.localeCompare(b)), [files]);
  const [selectedFile, setSelectedFile] = useState<string>(fileNames[0] ?? 'car.ini');
  const [filter, setFilter] = useState('');
  const [newFileName, setNewFileName] = useState('');

  const activeFile = files[selectedFile] !== undefined ? selectedFile : fileNames[0] ?? '';

  const filteredNames = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return fileNames;
    return fileNames.filter((n) => n.toLowerCase().includes(q));
  }, [fileNames, filter]);

  const handleCreateFile = () => {
    const clean = newFileName.trim().replace(/[^a-zA-Z0-9._-]/g, '');
    if (!clean) return;
    if (files[clean] === undefined) {
      onUpdateFile(clean, '; Created with AC Car Studio\n');
    }
    setSelectedFile(clean);
    setNewFileName('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-210px)] min-h-[520px]">
      {/* File List */}
      <div className="bg-[#121722] border border-[#242e42] rounded-xl p-3 flex flex-col">
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="ファイル検索 (ini / lut)..."
            className="w-full bg-[#0b0e14] border border-[#2b354b] rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {filteredNames.map((name) => {
            const isModified = files[name] !== originalFiles[name];
            const isActive = name === activeFile;
            return (
              <button
                key={name}
                onClick={() => setSelectedFile(name)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono-num flex items-center justify-between transition-colors ${
                  isActive
                    ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                    : 'text-slate-300 hover:bg-[#1a2233] border border-transparent'
                }`}
              >
                <span className="truncate flex items-center gap-1.5">
                  <FileCode2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  {name}
                </span>
                {isModified && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="変更あり" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2 pt-2 border-t border-[#222b3e] flex gap-1.5">
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="新規ファイル.ini"
            className="flex-1 min-w-0 bg-[#0b0e14] border border-[#2b354b] rounded px-2 py-1 text-xs font-mono-num text-slate-200"
          />
          <button
            onClick={handleCreateFile}
            className="bg-[#1b2436] hover:bg-rose-600 text-slate-200 px-2 py-1 rounded text-xs"
            title="新規ファイル作成"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Text Editor */}
      <div className="lg:col-span-3 bg-[#121722] border border-[#242e42] rounded-xl p-3 flex flex-col">
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#222b3e]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono-num font-semibold text-cyan-300">{activeFile}</span>
            {activeFile && files[activeFile] !== originalFiles[activeFile] && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                未保存の変更あり
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono-num text-slate-500">
            {(files[activeFile] ?? '').split(/\r?\n/).length} 行
          </span>
        </div>

        <textarea
          value={files[activeFile] ?? ''}
          onChange={(e) => activeFile && onUpdateFile(activeFile, e.target.value)}
          spellCheck={false}
          className="flex-1 w-full bg-[#090c11] border border-[#1f283b] rounded-lg p-3 font-mono text-xs leading-relaxed text-slate-200 focus:outline-none focus:border-cyan-500 resize-none"
        />
      </div>
    </div>
  );
};
