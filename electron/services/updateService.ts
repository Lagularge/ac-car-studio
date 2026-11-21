import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { app, shell } from 'electron';
import type {
  AppUpdateApplyResult,
  AppUpdateCheckResult,
  AppUpdateInstallMode,
  AppUpdateProgressEvent,
} from '../../src/types/ac';
import {
  APP_GITHUB_LATEST_RELEASE_API,
  APP_GITHUB_RELEASES_URL,
  isNewerVersion,
  normalizeVersionTag,
  pickWindowsReleaseAsset,
  type GitHubReleaseAsset,
} from '../../src/utils/updateChecker';

const execFileAsync = promisify(execFile);

interface GitHubLatestReleasePayload {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
  html_url?: string;
  assets?: GitHubReleaseAsset[];
}

export function getAppVersion(): string {
  try {
    return app.getVersion() || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function getPortableExePath(): string | null {
  const p = process.env.PORTABLE_EXECUTABLE_FILE;
  if (p && fs.existsSync(p)) return p;
  return null;
}

function getLocalGitRepoDir(): string | null {
  if (app.isPackaged) return null;
  const appPath = app.getAppPath();
  if (fs.existsSync(path.join(appPath, '.git'))) return appPath;
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.git'))) return cwd;
  return null;
}

function detectInstallMode(hasDownloadableExe: boolean): AppUpdateInstallMode {
  if (getPortableExePath() && hasDownloadableExe) return 'portable_exe';
  if (getLocalGitRepoDir()) return 'git_pull';
  if (hasDownloadableExe) return 'portable_exe';
  return 'browser_download';
}

export async function checkForGitHubUpdates(): Promise<AppUpdateCheckResult> {
  const currentVersion = getAppVersion();
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(APP_GITHUB_LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `AC-Car-Studio/${currentVersion}`,
      },
      signal: controller.signal,
    });

    if (res.status === 404) {
      return {
        status: 'no_releases',
        currentVersion,
        latestVersion: null,
        releaseName: null,
        releaseNotes: '',
        publishedAt: null,
        releaseUrl: APP_GITHUB_RELEASES_URL,
        downloadUrl: null,
        assetName: null,
        assetSizeBytes: 0,
        installMode: detectInstallMode(false),
        checkedAt,
      };
    }

    if (!res.ok) {
      return {
        status: 'error',
        currentVersion,
        latestVersion: null,
        releaseName: null,
        releaseNotes: '',
        publishedAt: null,
        releaseUrl: APP_GITHUB_RELEASES_URL,
        downloadUrl: null,
        assetName: null,
        assetSizeBytes: 0,
        installMode: 'browser_download',
        checkedAt,
        error: `GitHub API応答エラー (HTTP ${res.status})`,
      };
    }

    const data = (await res.json()) as GitHubLatestReleasePayload;
    const rawTag = (data.tag_name || '').trim();
    const latestVersion = rawTag ? normalizeVersionTag(rawTag) : null;
    const asset = pickWindowsReleaseAsset(data.assets);
    const hasExe = !!(asset && asset.browser_download_url.toLowerCase().endsWith('.exe'));
    const updateAvailable = latestVersion ? isNewerVersion(latestVersion, currentVersion) : false;

    return {
      status: updateAvailable ? 'update_available' : 'up_to_date',
      currentVersion,
      latestVersion,
      releaseName: data.name || rawTag || null,
      releaseNotes: (data.body || '').trim(),
      publishedAt: data.published_at || null,
      releaseUrl: data.html_url || APP_GITHUB_RELEASES_URL,
      downloadUrl: asset?.browser_download_url ?? null,
      assetName: asset?.name ?? null,
      assetSizeBytes: asset?.size ?? 0,
      installMode: detectInstallMode(hasExe),
      checkedAt,
    };
  } catch (err) {
    return {
      status: 'error',
      currentVersion,
      latestVersion: null,
      releaseName: null,
      releaseNotes: '',
      publishedAt: null,
      releaseUrl: APP_GITHUB_RELEASES_URL,
      downloadUrl: null,
      assetName: null,
      assetSizeBytes: 0,
      installMode: 'browser_download',
      checkedAt,
      error:
        err instanceof Error && err.name === 'AbortError'
          ? 'GitHub への接続がタイムアウトしました'
          : err instanceof Error
            ? err.message
            : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadFileWithProgress(
  url: string,
  destPath: string,
  expectedTotalBytes: number,
  onProgress: (ev: AppUpdateProgressEvent) => void
): Promise<number> {
  const res = await fetch(url, {
    headers: { 'User-Agent': `AC-Car-Studio/${getAppVersion()}` },
    redirect: 'follow',
  });
  if (!res.ok || !res.body) {
    throw new Error(`ダウンロードに失敗しました (HTTP ${res.status})`);
  }

  const headerLen = Number(res.headers.get('content-length') || 0);
  const totalBytes = headerLen > 0 ? headerLen : expectedTotalBytes;

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const ws = fs.createWriteStream(destPath);
  const reader = res.body.getReader();

  let downloadedBytes = 0;
  let lastEmitTs = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        downloadedBytes += value.byteLength;
        ws.write(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
        const now = Date.now();
        if (now - lastEmitTs >= 120) {
          lastEmitTs = now;
          const percent =
            totalBytes > 0 ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 50;
          onProgress({
            phase: 'downloading',
            percent,
            message: `最新バージョンをダウンロード中... (${percent}%)`,
            downloadedBytes,
            totalBytes,
          });
        }
      }
    }
    await new Promise<void>((resolve, reject) => {
      ws.end(() => resolve());
      ws.on('error', reject);
    });
  } catch (err) {
    ws.destroy();
    try {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }

  return downloadedBytes;
}

function verifyWindowsPeExecutable(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 1_000_000) return false;
    const fd = fs.openSync(filePath, 'r');
    const hdr = Buffer.alloc(2);
    fs.readSync(fd, hdr, 0, 2, 0);
    fs.closeSync(fd);
    return hdr[0] === 0x4d && hdr[1] === 0x5a; // 'MZ'
  } catch {
    return false;
  }
}

export async function performAppUpdate(
  info: AppUpdateCheckResult,
  onProgress: (ev: AppUpdateProgressEvent) => void
): Promise<AppUpdateApplyResult> {
  // 1. Source / Dev Git Checkout Update
  const gitRepoDir = getLocalGitRepoDir();
  if (info.installMode === 'git_pull' && gitRepoDir) {
    try {
      onProgress({
        phase: 'git_pull',
        percent: 20,
        message: 'ローカル作業ツリーを確認中...',
      });
      const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: gitRepoDir,
      });
      if (statusOut.trim().length > 0) {
        // Avoid overwriting local uncommitted changes
        await shell.openExternal(info.releaseUrl);
        return {
          ok: true,
          message:
            '未コミットのローカル変更があるため Git 自動更新をスキップし、ブラウザで GitHub リリースページを開きました。',
        };
      }

      onProgress({
        phase: 'git_pull',
        percent: 45,
        message: 'GitHub (origin/main) から最新コードを取得中...',
      });
      await execFileAsync('git', ['pull', '--ff-only', 'origin', 'main'], { cwd: gitRepoDir });

      onProgress({
        phase: 'building',
        percent: 75,
        message: '最新バージョンをビルド中 (npm run build)...',
      });
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      await execFileAsync(npmCmd, ['run', 'build'], { cwd: gitRepoDir });

      onProgress({
        phase: 'done',
        percent: 100,
        message: 'アップデート完了！アプリを再起動します...',
      });
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 900);

      return {
        ok: true,
        restarting: true,
        message: 'GitHub から最新コードを取得・ビルドしました。アプリを再起動します。',
      };
    } catch (err) {
      return {
        ok: false,
        message: `Git 自動更新に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 2. Portable Windows .exe Direct Download + Auto-Replace (or Downloads save)
  if (info.downloadUrl && info.assetName && info.downloadUrl.startsWith('https://')) {
    const portableExe = getPortableExePath();
    const safeAsset = path.basename(info.assetName);

    try {
      if (portableExe && safeAsset.toLowerCase().endsWith('.exe')) {
        const stagedPath = `${portableExe}.update.tmp`;
        await downloadFileWithProgress(
          info.downloadUrl,
          stagedPath,
          info.assetSizeBytes,
          onProgress
        );

        onProgress({
          phase: 'verifying',
          percent: 96,
          message: 'ダウンロードした実行ファイルを検証中...',
        });
        if (!verifyWindowsPeExecutable(stagedPath)) {
          fs.unlinkSync(stagedPath);
          throw new Error('ダウンロードした実行ファイルの検証に失敗しました。');
        }

        onProgress({
          phase: 'applying',
          percent: 99,
          message: 'アップデートを適用してアプリを再起動します...',
        });

        // Create minimal self-deleting Windows helper script to swap the running portable EXE cleanly
        const scriptPath = path.join(os.tmpdir(), `ac_car_studio_updater_${Date.now()}.cmd`);
        const cmdBody = [
          '@echo off',
          'timeout /t 2 /nobreak >nul',
          ':retry',
          `move /Y "${stagedPath}" "${portableExe}" >nul 2>&1`,
          'if errorlevel 1 (',
          '  timeout /t 1 /nobreak >nul',
          '  goto retry',
          ')',
          `start "" "${portableExe}"`,
          'del "%~f0"',
        ].join('\r\n');
        fs.writeFileSync(scriptPath, cmdBody, 'utf8');

        const child = spawn('cmd.exe', ['/c', scriptPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        child.unref();

        onProgress({
          phase: 'done',
          percent: 100,
          message: '最新版へ切り替えています...',
        });

        setTimeout(() => {
          app.quit();
        }, 700);

        return {
          ok: true,
          restarting: true,
          downloadedPath: portableExe,
          message: '最新バージョンへ自動置換し、アプリを再起動します。',
        };
      }

      // Not running from portable EXE -> download cleanly to Downloads folder & open folder
      const downloadsDir = app.getPath('downloads');
      const targetPath = path.join(downloadsDir, safeAsset);
      await downloadFileWithProgress(
        info.downloadUrl,
        targetPath,
        info.assetSizeBytes,
        onProgress
      );

      onProgress({
        phase: 'done',
        percent: 100,
        message: 'ダウンロードフォルダに保存しました！',
      });
      shell.showItemInFolder(targetPath);

      return {
        ok: true,
        downloadedPath: targetPath,
        message: `最新版をダウンロードフォルダ (${safeAsset}) へ保存しました。エクスプローラーから起動できます。`,
      };
    } catch (err) {
      onProgress({
        phase: 'error',
        percent: 0,
        message: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        message: `アップデートに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 3. Fallback: Open GitHub Releases in browser
  await shell.openExternal(info.releaseUrl || APP_GITHUB_RELEASES_URL);
  return {
    ok: true,
    message: 'ブラウザで GitHub リリースページを開きました。',
  };
}
