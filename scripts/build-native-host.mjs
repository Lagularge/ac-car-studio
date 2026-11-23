import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '1.1.0';

const distDir = path.join(rootDir, 'dist');
const hostDir = path.join(rootDir, 'native-host');
const csproj = path.join(hostDir, 'AcCarStudioHost.csproj');
const embeddedDir = path.join(hostDir, 'EmbeddedAssets');
const releaseDir = path.join(rootDir, 'release');

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('[build-native-host] dist/index.html missing. Run `vite build` first.');
  process.exit(1);
}

fs.mkdirSync(embeddedDir, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });

// 1. Pack dist/ into EmbeddedAssets/dist.zip with Optimal compression
const distZip = path.join(embeddedDir, 'dist.zip');
if (fs.existsSync(distZip)) fs.unlinkSync(distZip);

console.log('[build-native-host] Packing dist/ -> EmbeddedAssets/dist.zip ...');
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${distDir.replace(/'/g, "''")}', '${distZip.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $false)`,
  ],
  { stdio: 'inherit' }
);

const zipKb = (fs.statSync(distZip).size / 1024).toFixed(1);
console.log(`[build-native-host] dist.zip ready (${zipKb} KB)`);

// 2. First build / restore to ensure WebView2 DLLs are present in output
console.log('[build-native-host] Restoring & staging WebView2 runtime DLLs...');
execFileSync(
  'dotnet',
  ['build', csproj, '-c', 'Release', '-p:Platform=x64', `-p:Version=${version}`, `-p:AssemblyVersion=${version}.0`, `-p:FileVersion=${version}.0`, '--nologo'],
  { stdio: 'inherit' }
);

const binDir = path.join(hostDir, 'bin', 'x64', 'Release', 'net48');
const dllCopies = [
  { src: path.join(binDir, 'Microsoft.Web.WebView2.Core.dll'), dst: path.join(embeddedDir, 'Microsoft.Web.WebView2.Core.dll') },
  { src: path.join(binDir, 'Microsoft.Web.WebView2.WinForms.dll'), dst: path.join(embeddedDir, 'Microsoft.Web.WebView2.WinForms.dll') },
  { src: path.join(binDir, 'runtimes', 'win-x64', 'native', 'WebView2Loader.dll'), dst: path.join(embeddedDir, 'WebView2Loader.dll') },
];

let copiedAny = false;
for (const item of dllCopies) {
  if (!fs.existsSync(item.src)) {
    console.error(`[build-native-host] Missing WebView2 file: ${item.src}`);
    process.exit(1);
  }
  const needCopy =
    !fs.existsSync(item.dst) || fs.statSync(item.dst).size !== fs.statSync(item.src).size;
  if (needCopy) {
    fs.copyFileSync(item.src, item.dst);
    copiedAny = true;
  }
}

// 3. Final single-file Release build embedding dist.zip + WebView2 managed/native DLLs
console.log(`[build-native-host] Building single-file lightweight executable (v${version})...`);
execFileSync(
  'dotnet',
  [
    'build',
    csproj,
    '-c',
    'Release',
    '-p:Platform=x64',
    `-p:Version=${version}`,
    `-p:AssemblyVersion=${version}.0`,
    `-p:FileVersion=${version}.0`,
    ...(copiedAny ? ['--no-incremental'] : []),
    '--nologo',
  ],
  { stdio: 'inherit' }
);

const builtExe = path.join(binDir, 'AC-Car-Studio.exe');
const outPortable = path.join(releaseDir, `AC-Car-Studio-${version}-win-portable.exe`);
fs.copyFileSync(builtExe, outPortable);

// Clean up any stale Electron unpacked folder / older portable EXEs
const oldUnpacked = path.join(releaseDir, 'win-unpacked');
if (fs.existsSync(oldUnpacked)) {
  try { fs.rmSync(oldUnpacked, { recursive: true, force: true }); } catch {}
}

// 4. Verify native ACD codec self-test
console.log('[build-native-host] Running native host self-test...');
execFileSync(outPortable, ['--self-test'], { stdio: 'inherit' });

const exeMb = (fs.statSync(outPortable).size / (1024 * 1024)).toFixed(2);
console.log(`[build-native-host] SUCCESS! Built standalone ${outPortable} (${exeMb} MB)`);
