import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type {
  AcServerConfigFiles,
  AcServerLogEvent,
  AcServerSavePayload,
  AcServerStatus,
  AcTrackLayoutInfo,
  AcTrackSummary,
} from '../../src/types/ac';
import { parseAcJson } from './acFileService';

let activeServerProcess: ChildProcess | null = null;
let activeServerDir: string | null = null;
let activeServerStartedAt: string | null = null;

function resolveAcRootFromCarsDir(carsDir?: string | null): string | null {
  if (!carsDir) return null;
  // Standard layout: <AC_ROOT>/content/cars
  const parent = path.dirname(carsDir);
  if (path.basename(parent).toLowerCase() === 'content') {
    return path.dirname(parent);
  }
  return null;
}

export function detectAcServerDir(carsDir?: string | null): {
  serverDir: string | null;
  hasAcServerExe: boolean;
  candidates: string[];
} {
  const candidates = new Set<string>();

  const derivedRoot = resolveAcRootFromCarsDir(carsDir);
  if (derivedRoot) {
    candidates.add(path.join(derivedRoot, 'server'));
  }

  for (const base of [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa\\server',
    'C:\\Program Files\\Steam\\steamapps\\common\\assettocorsa\\server',
    'D:\\SteamLibrary\\steamapps\\common\\assettocorsa\\server',
    'D:\\Steam\\steamapps\\common\\assettocorsa\\server',
    'E:\\SteamLibrary\\steamapps\\common\\assettocorsa\\server',
    'F:\\SteamLibrary\\steamapps\\common\\assettocorsa\\server',
    'G:\\SteamLibrary\\steamapps\\common\\assettocorsa\\server',
  ]) {
    candidates.add(base);
  }

  // Parse Steam libraryfolders.vdf
  for (const vdf of [
    'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf',
    'C:\\Program Files\\Steam\\steamapps\\libraryfolders.vdf',
  ]) {
    if (fs.existsSync(vdf)) {
      try {
        const content = fs.readFileSync(vdf, 'utf8');
        for (const m of content.matchAll(/"path"\s+"([^"]+)"/g)) {
          const libPath = m[1].replace(/\\\\/g, '\\');
          candidates.add(path.join(libPath, 'steamapps', 'common', 'assettocorsa', 'server'));
        }
      } catch {
        // ignore
      }
    }
  }

  const found: string[] = [];
  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).isDirectory()) {
      found.push(cand);
    }
  }

  // Prefer candidate that actually has acServer.exe
  const withExe = found.find((d) => fs.existsSync(path.join(d, 'acServer.exe')));
  const chosen = withExe ?? found[0] ?? null;

  return {
    serverDir: chosen,
    hasAcServerExe: chosen ? fs.existsSync(path.join(chosen, 'acServer.exe')) : false,
    candidates: found,
  };
}

function readTrackJson(jsonPath: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    return parseAcJson(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readTrackImageDataUrl(
  dir: string,
  fileNames: string[],
  maxBytes = 2_500_000
): string | undefined {
  for (const name of fileNames) {
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > maxBytes) continue;
      const ext = path.extname(name).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
      return `data:${mime};base64,${fs.readFileSync(full).toString('base64')}`;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

export function listInstalledTracks(
  carsDir?: string | null,
  serverDir?: string | null
): AcTrackSummary[] {
  const trackDirCandidates: string[] = [];
  const rootFromCars = resolveAcRootFromCarsDir(carsDir);
  if (rootFromCars) trackDirCandidates.push(path.join(rootFromCars, 'content', 'tracks'));
  if (serverDir) trackDirCandidates.push(path.join(path.dirname(serverDir), 'content', 'tracks'));

  const tracksDir = trackDirCandidates.find((d) => fs.existsSync(d) && fs.statSync(d).isDirectory());
  if (!tracksDir) return [];

  const entries = fs.readdirSync(tracksDir, { withFileTypes: true });
  const tracks: AcTrackSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const trackPath = path.join(tracksDir, entry.name);
    const uiDir = path.join(trackPath, 'ui');
    if (!fs.existsSync(uiDir)) continue;

    const rootPreview = readTrackImageDataUrl(uiDir, ['preview.png', 'preview.jpg', 'preview.jpeg']);
    const rootOutline = readTrackImageDataUrl(uiDir, ['outline.png', 'outline.jpg']);

    const layouts: AcTrackLayoutInfo[] = [];
    const rootUiJson = path.join(uiDir, 'ui_track.json');

    if (fs.existsSync(rootUiJson)) {
      const meta = readTrackJson(rootUiJson);
      layouts.push({
        id: '',
        name: String(meta.name || entry.name),
        pitboxes: Number(meta.pitboxes) || 18,
        length: String(meta.length || ''),
        width: meta.width ? String(meta.width) : undefined,
        country: String(meta.country || ''),
        city: meta.city ? String(meta.city) : undefined,
        tags: Array.isArray(meta.tags) ? meta.tags.map(String) : undefined,
        previewDataUrl: rootPreview,
        outlineDataUrl: rootOutline,
      });
    } else {
      // Multi-layout track: ui/<layout_id>/ui_track.json
      try {
        const subEntries = fs.readdirSync(uiDir, { withFileTypes: true });
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          const subDir = path.join(uiDir, sub.name);
          const subJson = path.join(subDir, 'ui_track.json');
          if (!fs.existsSync(subJson)) continue;
          const meta = readTrackJson(subJson);
          const subPreview =
            readTrackImageDataUrl(subDir, ['preview.png', 'preview.jpg', 'preview.jpeg']) ??
            rootPreview;
          const subOutline =
            readTrackImageDataUrl(subDir, ['outline.png', 'outline.jpg']) ?? rootOutline;
          layouts.push({
            id: sub.name,
            name: String(meta.name || `${entry.name} (${sub.name})`),
            pitboxes: Number(meta.pitboxes) || 18,
            length: String(meta.length || ''),
            width: meta.width ? String(meta.width) : undefined,
            country: String(meta.country || ''),
            city: meta.city ? String(meta.city) : undefined,
            tags: Array.isArray(meta.tags) ? meta.tags.map(String) : undefined,
            previewDataUrl: subPreview,
            outlineDataUrl: subOutline,
          });
        }
      } catch {
        // ignore unreadable layout
      }
    }

    if (layouts.length === 0) continue;
    layouts.sort((a, b) => a.name.localeCompare(b.name));

    const first = layouts[0];
    tracks.push({
      id: entry.name,
      name: layouts.length === 1 ? first.name : entry.name,
      country: first.country,
      city: first.city || '',
      tags: first.tags,
      previewDataUrl: first.previewDataUrl ?? rootPreview,
      outlineDataUrl: first.outlineDataUrl ?? rootOutline,
      layouts,
    });
  }

  return tracks.sort((a, b) => a.name.localeCompare(b.name));
}

export function readServerConfig(serverDir: string): AcServerConfigFiles {
  const cfgDir = path.join(serverDir, 'cfg');
  const readOpt = (fileName: string): string => {
    const p = path.join(cfgDir, fileName);
    if (!fs.existsSync(p)) return '';
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return '';
    }
  };

  return {
    serverDir,
    hasAcServerExe: fs.existsSync(path.join(serverDir, 'acServer.exe')),
    serverCfgIni: readOpt('server_cfg.ini'),
    entryListIni: readOpt('entry_list.ini'),
    cspExtraOptionsIni: readOpt('csp_extra_options.ini'),
  };
}

export function saveServerConfig(
  serverDir: string,
  payload: AcServerSavePayload
): { ok: boolean; writtenFiles: string[]; error?: string } {
  try {
    const cfgDir = path.join(serverDir, 'cfg');
    fs.mkdirSync(cfgDir, { recursive: true });

    const writtenFiles: string[] = [];
    const cfgPath = path.join(cfgDir, 'server_cfg.ini');
    fs.writeFileSync(cfgPath, payload.serverCfgIni, 'utf8');
    writtenFiles.push('cfg/server_cfg.ini');

    const entryPath = path.join(cfgDir, 'entry_list.ini');
    fs.writeFileSync(entryPath, payload.entryListIni, 'utf8');
    writtenFiles.push('cfg/entry_list.ini');

    const cspPath = path.join(cfgDir, 'csp_extra_options.ini');
    if (payload.writeCspExtra) {
      fs.writeFileSync(cspPath, payload.cspExtraOptionsIni, 'utf8');
      writtenFiles.push('cfg/csp_extra_options.ini');
    } else if (fs.existsSync(cspPath)) {
      try {
        fs.unlinkSync(cspPath);
      } catch {
        // ignore
      }
    }

    return { ok: true, writtenFiles };
  } catch (err) {
    return {
      ok: false,
      writtenFiles: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getAcServerStatus(): AcServerStatus {
  const running = !!(activeServerProcess && activeServerProcess.exitCode === null && !activeServerProcess.killed);
  return {
    running,
    pid: running ? (activeServerProcess?.pid ?? null) : null,
    serverDir: running ? activeServerDir : null,
    startedAt: running ? activeServerStartedAt : null,
  };
}

export function startAcServer(
  serverDir: string,
  onLog: (ev: AcServerLogEvent) => void,
  onExit: (info: { code: number | null; signal: string | null }) => void
): { ok: boolean; status?: AcServerStatus; error?: string } {
  if (getAcServerStatus().running) {
    return { ok: false, error: 'acServer.exe は既に起動中です。先に停止してください。' };
  }

  const exePath = path.join(serverDir, 'acServer.exe');
  if (!fs.existsSync(exePath)) {
    return {
      ok: false,
      error: `acServer.exe が見つかりません: ${exePath}\nAssetto Corsa の server フォルダを選択してください。`,
    };
  }

  try {
    const child = spawn(exePath, [], {
      cwd: serverDir,
      windowsHide: true,
    });

    activeServerProcess = child;
    activeServerDir = serverDir;
    activeServerStartedAt = new Date().toISOString();

    const emitChunk = (stream: 'stdout' | 'stderr', buf: Buffer) => {
      const text = buf.toString('utf8');
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        if (line.length > 0) {
          onLog({ stream, line, timestamp: new Date().toISOString() });
        }
      }
    };

    child.stdout?.on('data', (d: Buffer) => emitChunk('stdout', d));
    child.stderr?.on('data', (d: Buffer) => emitChunk('stderr', d));

    child.on('error', (err) => {
      onLog({
        stream: 'stderr',
        line: `[ERROR] 起動失敗: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    });

    child.on('exit', (code, signal) => {
      activeServerProcess = null;
      activeServerDir = null;
      activeServerStartedAt = null;
      onLog({
        stream: 'system',
        line: `acServer.exe が終了しました (code=${code ?? 'null'}, signal=${signal ?? 'none'})`,
        timestamp: new Date().toISOString(),
      });
      onExit({ code, signal: signal ? String(signal) : null });
    });

    onLog({
      stream: 'system',
      line: `acServer.exe を起動しました (PID ${child.pid ?? '-'} / CWD: ${serverDir})`,
      timestamp: new Date().toISOString(),
    });

    return { ok: true, status: getAcServerStatus() };
  } catch (err) {
    activeServerProcess = null;
    activeServerDir = null;
    activeServerStartedAt = null;
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function stopAcServer(): { ok: boolean; message: string } {
  if (!activeServerProcess || activeServerProcess.exitCode !== null) {
    activeServerProcess = null;
    activeServerDir = null;
    activeServerStartedAt = null;
    return { ok: true, message: 'サーバーは既に停止しています。' };
  }

  try {
    activeServerProcess.kill('SIGTERM');
    return { ok: true, message: 'acServer.exe へ停止シグナルを送信しました。' };
  } catch (err) {
    return {
      ok: false,
      message: `サーバー停止に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
