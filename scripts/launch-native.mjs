import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '1.1.0';
const exePath = path.join(rootDir, 'release', `AC-Car-Studio-${version}-win-portable.exe`);

if (!fs.existsSync(exePath)) {
  console.error(`[launch-native] Executable not found: ${exePath}. Run \`npm run build\` first.`);
  process.exit(1);
}

const child = spawn(exePath, [], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
