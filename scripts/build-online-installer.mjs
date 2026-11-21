import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = process.cwd();
const srcCs = path.join(rootDir, 'installer', 'OnlineInstaller.cs');
const outDir = path.join(rootDir, 'release');
const outExe = path.join(outDir, 'AC-Car-Studio-Online-Setup.exe');

const cscCandidates = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
];

const cscPath = cscCandidates.find((p) => fs.existsSync(p));
if (!cscPath) {
  console.error('[build-online-installer] Could not find csc.exe (.NET Framework 4.0)');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

execFileSync(
  cscPath,
  [
    '/nologo',
    '/target:winexe',
    '/optimize+',
    `/out:${outExe}`,
    '/r:System.dll',
    '/r:System.Core.dll',
    '/r:System.Drawing.dll',
    '/r:System.Windows.Forms.dll',
    '/r:System.Web.Extensions.dll',
    srcCs,
  ],
  { stdio: 'inherit' }
);

const stat = fs.statSync(outExe);
console.log(
  `[build-online-installer] Built ${outExe} (${(stat.size / 1024).toFixed(1)} KB)`
);
