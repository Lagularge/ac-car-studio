import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type {
  AcDetectResult,
  AcdActionResult,
  BackupEntry,
  CarModelFileInfo,
  CarSkinSummary,
  CarSummary,
  CreateCarPayload,
  CustomPresetRecord,
  LoadedCarData,
  SaveCarResult,
  SavedPartEntry,
  SavePartPayload,
  SaveSkinPayload,
  SoundExportPayload,
  SoundExportResult,
  UiCarJson,
} from '../../src/types/ac';
import { packAcdBuffer, unpackAcdBuffer } from './acdCodec';
import { buildNewCarFiles } from './carTemplates';

const BACKUP_DIR_NAME = '_ac_studio_backups';

/**
 * Assetto Corsa ui_car.json files in community mods often contain:
 * - UTF-8 BOM
 * - Unescaped newlines/tabs inside string literals
 * - Trailing commas
 */
export function parseAcJson(raw: string): UiCarJson {
  let cleaned = raw.replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(cleaned) as UiCarJson;
  } catch {
    // Sanitize control characters inside quoted strings & trailing commas
    let inString = false;
    let escaped = false;
    let out = '';
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) {
          out += ch;
          escaped = false;
        } else if (ch === '\\') {
          out += ch;
          escaped = true;
        } else if (ch === '"') {
          inString = false;
          out += ch;
        } else if (ch === '\n') {
          out += '\\n';
        } else if (ch === '\r') {
          // skip
        } else if (ch === '\t') {
          out += '\\t';
        } else {
          out += ch;
        }
      } else {
        if (ch === '"') {
          inString = true;
        }
        out += ch;
      }
    }
    out = out.replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(out) as UiCarJson;
    } catch {
      return {};
    }
  }
}

export function detectAcCarsDir(): AcDetectResult {
  const candidates = new Set<string>([
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa\\content\\cars',
    'C:\\Program Files\\Steam\\steamapps\\common\\assettocorsa\\content\\cars',
    'D:\\SteamLibrary\\steamapps\\common\\assettocorsa\\content\\cars',
    'D:\\Steam\\steamapps\\common\\assettocorsa\\content\\cars',
    'E:\\SteamLibrary\\steamapps\\common\\assettocorsa\\content\\cars',
    'F:\\SteamLibrary\\steamapps\\common\\assettocorsa\\content\\cars',
    'G:\\SteamLibrary\\steamapps\\common\\assettocorsa\\content\\cars',
  ]);

  // Also parse Steam's libraryfolders.vdf if present
  const vdfPaths = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf',
    'C:\\Program Files\\Steam\\steamapps\\libraryfolders.vdf',
  ];
  for (const vdf of vdfPaths) {
    if (fs.existsSync(vdf)) {
      try {
        const content = fs.readFileSync(vdf, 'utf8');
        const matches = content.matchAll(/"path"\s+"([^"]+)"/g);
        for (const m of matches) {
          const libPath = m[1].replace(/\\\\/g, '\\');
          candidates.add(path.join(libPath, 'steamapps', 'common', 'assettocorsa', 'content', 'cars'));
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  const found: string[] = [];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      found.push(candidate);
    }
  }

  return {
    carsDir: found[0] ?? null,
    candidates: found,
  };
}

export function createDemoWorkspace(): string {
  const demoDir = path.join(app.getPath('userData'), 'demo_content_cars');
  fs.mkdirSync(demoDir, { recursive: true });

  const demoCars: Array<{ payload: CreateCarPayload; packAsAcdOnly?: boolean }> = [
    {
      payload: {
        folderName: 'ac_studio_rx_coupe_spec',
        name: 'Kurogane RX-7 Type-RS (Demo)',
        brand: 'Kurogane',
        country: 'Japan',
        year: 1999,
        carClass: 'street',
        author: 'AC Car Studio',
        description: '軽量FRスポーツクーペのデモ車両。ターボ・ギア比・足回りのチューニングベースに最適です。',
        templateId: 'fr_sports',
        massKg: 1260,
        peakTorqueNm: 365,
        maxRpm: 8200,
        turboBoostBar: 0.85,
      },
    },
    {
      payload: {
        folderName: 'ac_studio_s15_drift_pro',
        name: 'Silvia S15 D-Spec Pro (Demo)',
        brand: 'Nismo-Style',
        country: 'Japan',
        year: 2001,
        carClass: 'drift',
        author: 'AC Car Studio',
        description: '高切れ角ナックル・2Wayロックデフ・ハイブーストターボ仕様のドリフトデモ車両。',
        templateId: 'drift_spec',
        massKg: 1180,
        peakTorqueNm: 540,
        maxRpm: 7800,
        turboBoostBar: 1.45,
      },
    },
    {
      payload: {
        folderName: 'ac_studio_gt3_evo_acd',
        name: 'Apex GT3 Evo [data.acd Demo]',
        brand: 'Apex Racing',
        country: 'Germany',
        year: 2024,
        carClass: 'race',
        author: 'AC Car Studio',
        description: 'data.acdにパック済みのGT3レーシングカーデモ。ACD展開・編集・再パック機能をすぐに試せます。',
        templateId: 'gt3_race',
        massKg: 1245,
        peakTorqueNm: 630,
        maxRpm: 8500,
        turboBoostBar: 0,
      },
      packAsAcdOnly: true,
    },
  ];

  for (const item of demoCars) {
    const carDir = path.join(demoDir, item.payload.folderName);
    if (fs.existsSync(carDir)) continue;
    const { files, uiCarJson } = buildNewCarFiles(item.payload);
    fs.mkdirSync(path.join(carDir, 'ui'), { recursive: true });
    fs.writeFileSync(path.join(carDir, 'ui', 'ui_car.json'), JSON.stringify(uiCarJson, null, 2), 'utf8');

    if (item.packAsAcdOnly) {
      const bufMap: Record<string, Buffer> = {};
      for (const [k, v] of Object.entries(files)) {
        bufMap[k] = Buffer.from(v, 'utf8');
      }
      const { buffer } = packAcdBuffer(bufMap, item.payload.folderName);
      fs.writeFileSync(path.join(carDir, 'data.acd'), buffer);
    } else {
      const dataDir = path.join(carDir, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      for (const [k, v] of Object.entries(files)) {
        fs.writeFileSync(path.join(dataDir, k), v, 'utf8');
      }
    }
  }

  return demoDir;
}

function readBadgeImage(carDir: string): string | undefined {
  const badgePath = path.join(carDir, 'ui', 'badge.png');
  try {
    const stat = fs.statSync(badgePath);
    if (stat.size <= 500_000) {
      return `data:image/png;base64,${fs.readFileSync(badgePath).toString('base64')}`;
    }
  } catch {
    // missing or unreadable
  }
  return undefined;
}

function readPreviewImage(carDir: string, fallbackBadgeDataUrl?: string): string | undefined {
  // 1. Try skins/*/preview.jpg
  const skinsDir = path.join(carDir, 'skins');
  try {
    const skins = fs.readdirSync(skinsDir, { withFileTypes: true });
    for (const skin of skins) {
      if (!skin.isDirectory()) continue;
      const previewPath = path.join(skinsDir, skin.name, 'preview.jpg');
      try {
        const stat = fs.statSync(previewPath);
        if (stat.size <= 1_500_000) {
          return `data:image/jpeg;base64,${fs.readFileSync(previewPath).toString('base64')}`;
        }
      } catch {
        // try next skin
      }
    }
  } catch {
    // no skins dir
  }

  // 2. Fallback to already-read ui/badge.png (avoids duplicate disk read & duplicate base64 string in RAM)
  return fallbackBadgeDataUrl !== undefined ? fallbackBadgeDataUrl : readBadgeImage(carDir);
}

function countBackups(carDir: string): number {
  const bDir = path.join(carDir, BACKUP_DIR_NAME);
  if (!fs.existsSync(bDir)) return 0;
  try {
    return fs.readdirSync(bDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  } catch {
    return 0;
  }
}

export function listCars(carsDir: string): CarSummary[] {
  if (!fs.existsSync(carsDir)) return [];
  const entries = fs.readdirSync(carsDir, { withFileTypes: true });
  const cars: CarSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === BACKUP_DIR_NAME) continue;

    const carDir = path.join(carsDir, entry.name);
    const dataDir = path.join(carDir, 'data');
    const acdPath = path.join(carDir, 'data.acd');
    const uiJsonPath = path.join(carDir, 'ui', 'ui_car.json');

    const hasDataFolder = fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory();
    const hasDataAcd = fs.existsSync(acdPath) && fs.statSync(acdPath).isFile();

    // Skip non-car directories
    if (!hasDataFolder && !hasDataAcd && !fs.existsSync(uiJsonPath)) {
      continue;
    }

    let ui: UiCarJson = {};
    if (fs.existsSync(uiJsonPath)) {
      try {
        ui = parseAcJson(fs.readFileSync(uiJsonPath, 'utf8'));
      } catch {
        ui = {};
      }
    }

    const badgeDataUrl = readBadgeImage(carDir);
    cars.push({
      id: entry.name,
      name: ui.name?.trim() || entry.name,
      brand: ui.brand?.trim() || 'Unknown',
      carClass: ui.class?.trim() || 'street',
      year: ui.year ? String(ui.year) : '',
      country: ui.country?.trim() || '',
      hasDataFolder,
      hasDataAcd,
      dataSource: hasDataFolder ? 'folder' : hasDataAcd ? 'acd' : 'none',
      previewDataUrl: readPreviewImage(carDir, badgeDataUrl),
      badgeDataUrl,
      bhpSpec: ui.specs?.bhp,
      torqueSpec: ui.specs?.torque,
      weightSpec: ui.specs?.weight,
      backupCount: countBackups(carDir),
    });
  }

  return cars.sort((a, b) => a.name.localeCompare(b.name));
}

function readDataFolderFiles(dataDir: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(dataDir)) return result;

  const entries = fs.readdirSync(dataDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(dataDir, entry.name);
    try {
      result[entry.name] = fs.readFileSync(filePath, 'utf8');
    } catch {
      // skip unreadable binary files
    }
  }
  return result;
}

export function loadCar(carsDir: string, carId: string): LoadedCarData {
  const carDir = path.join(carsDir, carId);
  if (!fs.existsSync(carDir)) {
    throw new Error(`車両フォルダが見つかりません: ${carDir}`);
  }

  const dataDir = path.join(carDir, 'data');
  const acdPath = path.join(carDir, 'data.acd');
  const uiJsonPath = path.join(carDir, 'ui', 'ui_car.json');

  const hasDataFolder = fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory();
  const hasDataAcd = fs.existsSync(acdPath) && fs.statSync(acdPath).isFile();

  let files: Record<string, string> = {};
  let loadedFromAcd = false;

  if (hasDataFolder) {
    files = readDataFolderFiles(dataDir);
  } else if (hasDataAcd) {
    const buf = fs.readFileSync(acdPath);
    const unpacked = unpackAcdBuffer(buf, carId);
    for (const [name, contentBuf] of Object.entries(unpacked.files)) {
      files[name] = contentBuf.toString('utf8');
    }
    loadedFromAcd = true;
  }

  let uiCarJsonRaw = '';
  let uiCarJson: UiCarJson = {};
  if (fs.existsSync(uiJsonPath)) {
    uiCarJsonRaw = fs.readFileSync(uiJsonPath, 'utf8');
    uiCarJson = parseAcJson(uiCarJsonRaw);
  }

  const badgeDataUrl = readBadgeImage(carDir);
  const summary: CarSummary = {
    id: carId,
    name: uiCarJson.name?.trim() || carId,
    brand: uiCarJson.brand?.trim() || 'Unknown',
    carClass: uiCarJson.class?.trim() || 'street',
    year: uiCarJson.year ? String(uiCarJson.year) : '',
    country: uiCarJson.country?.trim() || '',
    hasDataFolder,
    hasDataAcd,
    dataSource: hasDataFolder ? 'folder' : hasDataAcd ? 'acd' : 'none',
    previewDataUrl: readPreviewImage(carDir, badgeDataUrl),
    badgeDataUrl,
    bhpSpec: uiCarJson.specs?.bhp,
    torqueSpec: uiCarJson.specs?.torque,
    weightSpec: uiCarJson.specs?.weight,
    backupCount: countBackups(carDir),
  };

  return {
    summary,
    carDir,
    files,
    uiCarJson,
    uiCarJsonRaw,
    loadedFromAcd,
  };
}

export function createBackup(
  carsDir: string,
  carId: string,
  note: string
): { ok: boolean; entry?: BackupEntry; error?: string } {
  try {
    const carDir = path.join(carsDir, carId);
    const backupsRoot = path.join(carDir, BACKUP_DIR_NAME);
    fs.mkdirSync(backupsRoot, { recursive: true });

    const now = new Date();
    const id = now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '_');
    const targetDir = path.join(backupsRoot, id);
    fs.mkdirSync(targetDir, { recursive: true });

    const dataDir = path.join(carDir, 'data');
    const acdPath = path.join(carDir, 'data.acd');
    const uiJsonPath = path.join(carDir, 'ui', 'ui_car.json');

    let hasDataFolder = false;
    let hasDataAcd = false;
    let fileCount = 0;

    if (fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory()) {
      hasDataFolder = true;
      const dstData = path.join(targetDir, 'data');
      fs.mkdirSync(dstData, { recursive: true });
      const entries = fs.readdirSync(dataDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile()) {
          fs.copyFileSync(path.join(dataDir, e.name), path.join(dstData, e.name));
          fileCount++;
        }
      }
    }

    if (fs.existsSync(acdPath) && fs.statSync(acdPath).isFile()) {
      hasDataAcd = true;
      fs.copyFileSync(acdPath, path.join(targetDir, 'data.acd'));
      if (!hasDataFolder) {
        try {
          const unpacked = unpackAcdBuffer(fs.readFileSync(acdPath), carId);
          fileCount = Object.keys(unpacked.files).length;
        } catch {
          fileCount = 1;
        }
      }
    }

    if (fs.existsSync(uiJsonPath)) {
      fs.copyFileSync(uiJsonPath, path.join(targetDir, 'ui_car.json'));
    }

    const entry: BackupEntry = {
      id,
      timestamp: now.toISOString(),
      note: note.trim() || '手動バックアップ',
      hasDataFolder,
      hasDataAcd,
      fileCount,
    };

    fs.writeFileSync(path.join(targetDir, 'meta.json'), JSON.stringify(entry, null, 2), 'utf8');
    return { ok: true, entry };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function listBackups(carsDir: string, carId: string): BackupEntry[] {
  const backupsRoot = path.join(carsDir, carId, BACKUP_DIR_NAME);
  if (!fs.existsSync(backupsRoot)) return [];

  const dirs = fs.readdirSync(backupsRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
  const list: BackupEntry[] = [];

  for (const d of dirs) {
    const metaPath = path.join(backupsRoot, d.name, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as BackupEntry;
        list.push(meta);
        continue;
      } catch {
        // fallback
      }
    }
    list.push({
      id: d.name,
      timestamp: d.name,
      note: 'バックアップ',
      hasDataFolder: fs.existsSync(path.join(backupsRoot, d.name, 'data')),
      hasDataAcd: fs.existsSync(path.join(backupsRoot, d.name, 'data.acd')),
      fileCount: 0,
    });
  }

  return list.sort((a, b) => b.id.localeCompare(a.id));
}

export function restoreBackup(
  carsDir: string,
  carId: string,
  backupId: string
): { ok: boolean; error?: string } {
  try {
    const carDir = path.join(carsDir, carId);
    const srcDir = path.join(carDir, BACKUP_DIR_NAME, backupId);
    if (!fs.existsSync(srcDir)) {
      return { ok: false, error: '指定されたバックアップが見つかりません。' };
    }

    const srcData = path.join(srcDir, 'data');
    const dstData = path.join(carDir, 'data');
    if (fs.existsSync(srcData)) {
      fs.rmSync(dstData, { recursive: true, force: true });
      fs.mkdirSync(dstData, { recursive: true });
      for (const e of fs.readdirSync(srcData, { withFileTypes: true })) {
        if (e.isFile()) {
          fs.copyFileSync(path.join(srcData, e.name), path.join(dstData, e.name));
        }
      }
    }

    const srcAcd = path.join(srcDir, 'data.acd');
    if (fs.existsSync(srcAcd)) {
      fs.copyFileSync(srcAcd, path.join(carDir, 'data.acd'));
    }

    const srcUi = path.join(srcDir, 'ui_car.json');
    if (fs.existsSync(srcUi)) {
      fs.mkdirSync(path.join(carDir, 'ui'), { recursive: true });
      fs.copyFileSync(srcUi, path.join(carDir, 'ui', 'ui_car.json'));
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function deleteBackup(
  carsDir: string,
  carId: string,
  backupId: string
): { ok: boolean; error?: string } {
  try {
    const targetDir = path.join(carsDir, carId, BACKUP_DIR_NAME, backupId);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function loadBackupData(
  carsDir: string,
  carId: string,
  backupId: string
): Record<string, string> {
  const srcDir = path.join(carsDir, carId, BACKUP_DIR_NAME, backupId);
  const srcData = path.join(srcDir, 'data');
  if (fs.existsSync(srcData)) {
    return readDataFolderFiles(srcData);
  }
  const srcAcd = path.join(srcDir, 'data.acd');
  if (fs.existsSync(srcAcd)) {
    const unpacked = unpackAcdBuffer(fs.readFileSync(srcAcd), carId);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(unpacked.files)) {
      out[k] = v.toString('utf8');
    }
    return out;
  }
  return {};
}

export function saveCar(
  carsDir: string,
  carId: string,
  files: Record<string, string>,
  uiCarJson: UiCarJson,
  options: { repackAcd?: boolean; createBackupFirst?: boolean; backupNote?: string }
): SaveCarResult {
  try {
    const carDir = path.join(carsDir, carId);
    if (!fs.existsSync(carDir)) {
      return { ok: false, savedFiles: 0, packedAcd: false, error: '車両フォルダが存在しません。' };
    }

    if (options.createBackupFirst) {
      createBackup(carsDir, carId, options.backupNote || '保存前自動バックアップ');
    }

    const dataDir = path.join(carDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    let savedFiles = 0;
    const bufMap: Record<string, Buffer> = {};
    const writtenNames = new Set<string>();
    for (const [fileName, content] of Object.entries(files)) {
      // Prevent path traversal
      const safeName = path.basename(fileName);
      fs.writeFileSync(path.join(dataDir, safeName), content, 'utf8');
      bufMap[safeName] = Buffer.from(content, 'utf8');
      writtenNames.add(safeName);
      savedFiles++;
    }

    // Safely remove stale managed Hybrid / CSP powertrain files when disabled in editor
    const managedRemovable = [
      'ers.ini',
      'kers_torque_power.lut',
      'kers_torque_coast.lut',
      'ctrl_ers_0.ini',
      'ctrl_ers_1.ini',
      'ctrl_ers_2.ini',
      'script.lua',
    ];
    for (const managedName of managedRemovable) {
      if (writtenNames.has(managedName)) continue;
      const diskPath = path.join(dataDir, managedName);
      if (!fs.existsSync(diskPath)) continue;
      if (managedName === 'script.lua') {
        try {
          const existing = fs.readFileSync(diskPath, 'utf8');
          if (!existing.includes('AC_CAR_STUDIO_')) continue;
        } catch {
          continue;
        }
      }
      try {
        fs.unlinkSync(diskPath);
      } catch {
        // ignore unlink errors
      }
    }

    // Write ui/ui_car.json
    const uiDir = path.join(carDir, 'ui');
    fs.mkdirSync(uiDir, { recursive: true });
    fs.writeFileSync(path.join(uiDir, 'ui_car.json'), JSON.stringify(uiCarJson, null, 2), 'utf8');

    let packedAcd = false;
    if (options.repackAcd) {
      const { buffer } = packAcdBuffer(bufMap, carId);
      fs.writeFileSync(path.join(carDir, 'data.acd'), buffer);
      packedAcd = true;
    }

    return { ok: true, savedFiles, packedAcd };
  } catch (err) {
    return {
      ok: false,
      savedFiles: 0,
      packedAcd: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function unpackAcd(carsDir: string, carId: string): AcdActionResult {
  try {
    const carDir = path.join(carsDir, carId);
    const acdPath = path.join(carDir, 'data.acd');
    if (!fs.existsSync(acdPath)) {
      return { ok: false, message: 'data.acd が見つかりません。' };
    }

    const buf = fs.readFileSync(acdPath);
    const { keyString, files } = unpackAcdBuffer(buf, carId);

    const dataDir = path.join(carDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      const safeName = path.basename(name);
      fs.writeFileSync(path.join(dataDir, safeName), content);
    }

    return {
      ok: true,
      fileCount: Object.keys(files).length,
      keyString,
      message: `data.acd を data/ フォルダに展開しました (${Object.keys(files).length} ファイル)。`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function packAcd(carsDir: string, carId: string, backupOldAcd = true): AcdActionResult {
  try {
    const carDir = path.join(carsDir, carId);
    const dataDir = path.join(carDir, 'data');
    if (!fs.existsSync(dataDir)) {
      return { ok: false, message: 'data/ フォルダが見つかりません。先に展開または保存してください。' };
    }

    const acdPath = path.join(carDir, 'data.acd');
    if (backupOldAcd && fs.existsSync(acdPath)) {
      createBackup(carsDir, carId, 'data.acd 再パック前バックアップ');
    }

    const bufMap: Record<string, Buffer> = {};
    for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      bufMap[entry.name] = fs.readFileSync(path.join(dataDir, entry.name));
    }

    if (Object.keys(bufMap).length === 0) {
      return { ok: false, message: 'data/ フォルダが空です。' };
    }

    const { keyString, buffer } = packAcdBuffer(bufMap, carId);
    fs.writeFileSync(acdPath, buffer);

    return {
      ok: true,
      fileCount: Object.keys(bufMap).length,
      keyString,
      message: `data/ (${Object.keys(bufMap).length} ファイル) を data.acd に再パックしました。`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function createCar(
  carsDir: string,
  payload: CreateCarPayload
): { ok: boolean; carId?: string; error?: string } {
  try {
    const folderName = payload.folderName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');

    if (!folderName) {
      return { ok: false, error: '有効なフォルダ名（半角英数字・アンダースコア）を入力してください。' };
    }

    const carDir = path.join(carsDir, folderName);
    if (fs.existsSync(carDir)) {
      return { ok: false, error: `フォルダ "${folderName}" は既に存在します。別の名前を指定してください。` };
    }

    const normalizedPayload: CreateCarPayload = { ...payload, folderName };
    const { files, uiCarJson } = buildNewCarFiles(normalizedPayload);

    const dataDir = path.join(carDir, 'data');
    const uiDir = path.join(carDir, 'ui');
    const skinsDir = path.join(carDir, 'skins', '00_default');
    const sfxDir = path.join(carDir, 'sfx');

    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(uiDir, { recursive: true });
    fs.mkdirSync(skinsDir, { recursive: true });
    fs.mkdirSync(sfxDir, { recursive: true });

    for (const [fileName, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dataDir, fileName), content, 'utf8');
    }

    fs.writeFileSync(path.join(uiDir, 'ui_car.json'), JSON.stringify(uiCarJson, null, 2), 'utf8');
    fs.writeFileSync(
      path.join(skinsDir, 'ui_skin.json'),
      JSON.stringify(
        {
          skinname: 'Default',
          drivername: '',
          country: payload.country || 'Japan',
          team: payload.brand || '',
          number: '01',
        },
        null,
        2
      ),
      'utf8'
    );

    return { ok: true, carId: folderName };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const PRESETS_FILE = () => path.join(app.getPath('userData'), 'custom_presets.json');

export function loadCustomPresets(): CustomPresetRecord[] {
  try {
    const file = PRESETS_FILE();
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CustomPresetRecord[];
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: CustomPresetRecord[]): boolean {
  try {
    const file = PRESETS_FILE();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(presets, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function getPrimaryLodFile(carDir: string, carId: string): string {
  const parseLods = (txt: string): string => {
    const m = txt.match(/\[LOD_0\][\s\S]*?FILE\s*=\s*([^\r\n;]+)/i);
    return m && m[1] ? m[1].trim() : '';
  };

  // 1. Check unpacked data/lods.ini
  const lodsPath = path.join(carDir, 'data', 'lods.ini');
  if (fs.existsSync(lodsPath)) {
    try {
      const found = parseLods(fs.readFileSync(lodsPath, 'utf8'));
      if (found) return found;
    } catch {
      // ignore
    }
  }

  // 2. Fallback: read lods.ini from data.acd if packed
  const acdPath = path.join(carDir, 'data.acd');
  if (fs.existsSync(acdPath)) {
    try {
      const unpacked = unpackAcdBuffer(fs.readFileSync(acdPath), carId);
      const lodsBuf = unpacked.files['lods.ini'] ?? unpacked.files['LODS.INI'];
      if (lodsBuf) {
        const found = parseLods(lodsBuf.toString('utf8'));
        if (found) return found;
      }
    } catch {
      // ignore
    }
  }

  return '';
}

function getKn5PriorityRank(fileName: string, primaryLodLower: string): number {
  const lower = fileName.toLowerCase();
  // Always put collider.kn5 (and any *collider*.kn5) at the very bottom
  if (lower === 'collider.kn5' || lower.includes('collider')) return 99;
  // Exact LOD_0 match from lods.ini gets highest priority
  if (primaryLodLower && lower === primaryLodLower) return 0;
  // Secondary / distant LODs or driver-only files rank below main car body
  if (/(?:_lod_[bcd]|lod_[bcd]|_lod[123]|lod[123]|driver|crew)/i.test(lower)) return 2;
  // Primary / main body candidates
  return 1;
}

export function listCarModels(carsDir: string, carId: string): CarModelFileInfo[] {
  const carDir = path.join(carsDir, carId);
  if (!fs.existsSync(carDir)) return [];
  const primary = getPrimaryLodFile(carDir, carId).toLowerCase();

  const raw: Array<CarModelFileInfo & { rank: number }> = [];
  for (const entry of fs.readdirSync(carDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.kn5')) continue;
    const stat = fs.statSync(path.join(carDir, entry.name));
    const rank = getKn5PriorityRank(entry.name, primary);
    raw.push({
      fileName: entry.name,
      sizeBytes: stat.size,
      isPrimaryLod: rank === 0,
      rank,
    });
  }

  raw.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    // Prefer larger main body mesh over small accessory/collider meshes
    if (a.sizeBytes !== b.sizeBytes) return b.sizeBytes - a.sizeBytes;
    return a.fileName.localeCompare(b.fileName);
  });

  // Mark the top non-collider model as primary if lods.ini didn't match explicitly
  if (raw.length > 0 && !raw.some((r) => r.isPrimaryLod) && raw[0].rank < 99) {
    raw[0].isPrimaryLod = true;
  }

  return raw.map(({ fileName, sizeBytes, isPrimaryLod }) => ({
    fileName,
    sizeBytes,
    isPrimaryLod,
  }));
}

export function readCarModelBytes(carsDir: string, carId: string, fileName: string): Uint8Array | null {
  const safeName = path.basename(fileName);
  const fullPath = path.join(carsDir, carId, safeName);
  if (!fs.existsSync(fullPath)) return null;
  const buf = fs.readFileSync(fullPath);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function saveCarModelBytes(
  carsDir: string,
  carId: string,
  fileName: string,
  bytes: Uint8Array,
  updateLodsIni = true
): { ok: boolean; message: string } {
  try {
    const carDir = path.join(carsDir, carId);
    if (!fs.existsSync(carDir)) {
      return { ok: false, message: '車両フォルダが見つかりません。' };
    }
    const safeName = path.basename(fileName).endsWith('.kn5')
      ? path.basename(fileName)
      : `${path.basename(fileName)}.kn5`;
    const targetPath = path.join(carDir, safeName);

    // Backup previous kn5 if overwriting
    if (fs.existsSync(targetPath)) {
      const bakDir = path.join(carDir, BACKUP_DIR_NAME, 'kn5_backups');
      fs.mkdirSync(bakDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
      fs.copyFileSync(targetPath, path.join(bakDir, `${ts}_${safeName}`));
    }

    fs.writeFileSync(targetPath, Buffer.from(bytes));

    if (updateLodsIni) {
      const dataDir = path.join(carDir, 'data');
      const lodsPath = path.join(dataDir, 'lods.ini');
      if (fs.existsSync(lodsPath)) {
        let lods = fs.readFileSync(lodsPath, 'utf8');
        if (/(\[LOD_0\][\s\S]*?FILE\s*=\s*)([^\r\n;]+)/i.test(lods)) {
          lods = lods.replace(/(\[LOD_0\][\s\S]*?FILE\s*=\s*)([^\r\n;]+)/i, `$1${safeName}`);
        } else {
          lods += `\n[LOD_0]\nFILE=${safeName}\nIN=0\nOUT=2000\n`;
        }
        fs.writeFileSync(lodsPath, lods, 'utf8');
      }
    }

    return {
      ok: true,
      message: `${safeName} を保存しました (${(bytes.byteLength / 1024).toFixed(1)} KB)`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export function replaceModelFromCar(
  carsDir: string,
  targetCarId: string,
  sourceCarId: string,
  sourceFileName: string
): { ok: boolean; targetFileName?: string; message: string } {
  try {
    const srcPath = path.join(carsDir, sourceCarId, path.basename(sourceFileName));
    if (!fs.existsSync(srcPath)) {
      return { ok: false, message: `元モデルが見つかりません: ${srcPath}` };
    }
    const bytes = fs.readFileSync(srcPath);
    const primaryTarget = getPrimaryLodFile(path.join(carsDir, targetCarId), targetCarId) || `${targetCarId}.kn5`;
    const res = saveCarModelBytes(
      carsDir,
      targetCarId,
      primaryTarget,
      new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      true
    );
    return {
      ok: res.ok,
      targetFileName: primaryTarget,
      message: res.ok
        ? `${sourceCarId}/${sourceFileName} を ${primaryTarget} に差し替えました`
        : res.message,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

const SOUND_EXT_MARKER_START = '; === AC_CAR_STUDIO_ENGINE_SIM_SOUND_START ===';
const SOUND_EXT_MARKER_END = '; === AC_CAR_STUDIO_ENGINE_SIM_SOUND_END ===';
const SOUND_LUA_FILENAME = 'ac_car_studio_engine_sound.lua';
const SOUND_WAV_SUBDIR = 'ac_car_studio_sound';

export function exportEngineSoundPack(
  carsDir: string,
  carId: string,
  payload: SoundExportPayload
): SoundExportResult {
  try {
    const carDir = path.join(carsDir, carId);
    if (!fs.existsSync(carDir)) {
      return { ok: false, writtenFiles: 0, message: '車両フォルダが見つかりません。' };
    }

    const sfxDir = path.join(carDir, 'sfx');
    const packDir = path.join(sfxDir, 'engine_sim_export');
    const extDir = path.join(carDir, 'extension');
    const extSoundDir = path.join(extDir, SOUND_WAV_SUBDIR);

    // Recreate runtime WAV dir so old RPM grid files never remain stale
    fs.rmSync(extSoundDir, { recursive: true, force: true });
    fs.mkdirSync(extSoundDir, { recursive: true });
    fs.mkdirSync(packDir, { recursive: true });

    let writtenFiles = 0;
    for (const sample of payload.samples) {
      const safeName = path.basename(sample.fileName);
      const buf = Buffer.from(sample.wavBytes);
      // 1. Live CSP runtime WAV bank inside extension/ac_car_studio_sound/
      fs.writeFileSync(path.join(extSoundDir, safeName), buf);
      writtenFiles++;
      // 2. Also keep exterior/fx samples in sfx/engine_sim_export/ for optional FMOD Studio import
      if (sample.perspective !== 'int') {
        fs.writeFileSync(path.join(packDir, safeName), buf);
      }
    }

    // Write live CSP Lua Engine Sound Runtime Script
    if (payload.cspLuaScript && payload.cspLuaScript.trim()) {
      fs.writeFileSync(path.join(extDir, SOUND_LUA_FILENAME), payload.cspLuaScript, 'utf8');
      writtenFiles++;
    }

    // Write manifest & optional FMOD reference in sfx/engine_sim_export/
    fs.writeFileSync(path.join(packDir, 'sound_manifest.json'), payload.manifestJson, 'utf8');
    writtenFiles++;
    if (payload.soundsIniPatch) {
      fs.writeFileSync(path.join(packDir, 'sounds_reference.ini'), payload.soundsIniPatch, 'utf8');
    }

    // Merge CSP [SCRIPT_...] hook cleanly into extension/ext_config.ini (non-destructive)
    const extConfigPath = path.join(extDir, 'ext_config.ini');
    const block = `${SOUND_EXT_MARKER_START}\n${payload.extConfigIni.trim()}\n${SOUND_EXT_MARKER_END}\n`;

    let existingExt = fs.existsSync(extConfigPath) ? fs.readFileSync(extConfigPath, 'utf8') : '';
    const sIdx = existingExt.indexOf(SOUND_EXT_MARKER_START);
    const eIdx = existingExt.indexOf(SOUND_EXT_MARKER_END);
    if (sIdx !== -1 && eIdx !== -1 && eIdx > sIdx) {
      const before = existingExt.slice(0, sIdx).trimEnd();
      const after = existingExt.slice(eIdx + SOUND_EXT_MARKER_END.length).trimStart();
      existingExt = [before, block.trimEnd(), after].filter(Boolean).join('\n\n') + '\n';
    } else {
      existingExt = existingExt.trimEnd() ? `${existingExt.trimEnd()}\n\n${block}` : block;
    }
    fs.writeFileSync(extConfigPath, existingExt, 'utf8');
    writtenFiles++;

    return {
      ok: true,
      exportDir: extSoundDir,
      writtenFiles,
      message: `ACへエンジン音を反映しました (車外3D+車内NVH ${payload.samples.length} WAV + CSP Lua音響ランタイム + ext_config.ini)。CSP有効状態のAssetto Corsaですぐに再生されます。`,
    };
  } catch (err) {
    return {
      ok: false,
      writtenFiles: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function removeCustomEngineSound(
  carsDir: string,
  carId: string
): { ok: boolean; message: string } {
  try {
    const carDir = path.join(carsDir, carId);
    if (!fs.existsSync(carDir)) {
      return { ok: false, message: '車両フォルダが見つかりません。' };
    }
    const extDir = path.join(carDir, 'extension');
    const luaPath = path.join(extDir, SOUND_LUA_FILENAME);
    const wavDir = path.join(extDir, SOUND_WAV_SUBDIR);
    const extConfigPath = path.join(extDir, 'ext_config.ini');

    if (fs.existsSync(luaPath)) fs.rmSync(luaPath, { force: true });
    if (fs.existsSync(wavDir)) fs.rmSync(wavDir, { recursive: true, force: true });

    if (fs.existsSync(extConfigPath)) {
      const raw = fs.readFileSync(extConfigPath, 'utf8');
      const sIdx = raw.indexOf(SOUND_EXT_MARKER_START);
      const eIdx = raw.indexOf(SOUND_EXT_MARKER_END);
      if (sIdx !== -1 && eIdx !== -1 && eIdx > sIdx) {
        const before = raw.slice(0, sIdx).trimEnd();
        const after = raw.slice(eIdx + SOUND_EXT_MARKER_END.length).trimStart();
        const cleaned = [before, after].filter(Boolean).join('\n\n');
        fs.writeFileSync(extConfigPath, cleaned ? `${cleaned}\n` : '', 'utf8');
      }
    }

    return {
      ok: true,
      message: 'カスタムエンジン音スクリプトを解除し、車両本来の .bank サウンドへ戻しました。',
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export function copySoundBankFromCar(
  carsDir: string,
  targetCarId: string,
  sourceCarId: string
): { ok: boolean; message: string } {
  try {
    const srcSfx = path.join(carsDir, sourceCarId, 'sfx');
    if (!fs.existsSync(srcSfx)) {
      return { ok: false, message: `コピー元車両 (${sourceCarId}) に sfx フォルダがありません。` };
    }
    const dstSfx = path.join(carsDir, targetCarId, 'sfx');
    fs.mkdirSync(dstSfx, { recursive: true });

    const files = fs.readdirSync(srcSfx);
    const bankFile = files.find((f) => f.toLowerCase().endsWith('.bank'));
    if (!bankFile) {
      return { ok: false, message: `コピー元車両 (${sourceCarId}) に .bank ファイルが見つかりません。` };
    }

    fs.copyFileSync(path.join(srcSfx, bankFile), path.join(dstSfx, `${targetCarId}.bank`));

    // Copy & rewrite GUIDs.txt if present
    const guidsFile = files.find((f) => f.toLowerCase() === 'guids.txt');
    if (guidsFile) {
      let guids = fs.readFileSync(path.join(srcSfx, guidsFile), 'utf8');
      const srcBase = path.basename(bankFile, '.bank');
      guids = guids.split(srcBase).join(targetCarId);
      fs.writeFileSync(path.join(dstSfx, 'GUIDs.txt'), guids, 'utf8');
    }

    return {
      ok: true,
      message: `${sourceCarId} のベース .bank & GUIDs.txt を ${targetCarId}.bank として移植しました。`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ===== In-App Parts Library (wheels, steering wheels, seats, wings, etc.) =====
const PARTS_LIB_DIR = () => path.join(app.getPath('userData'), 'parts_library');
const PARTS_INDEX_FILE = () => path.join(PARTS_LIB_DIR(), 'index.json');

export function listSavedParts(): SavedPartEntry[] {
  try {
    const idxFile = PARTS_INDEX_FILE();
    if (!fs.existsSync(idxFile)) return [];
    const list = JSON.parse(fs.readFileSync(idxFile, 'utf8')) as SavedPartEntry[];
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function savePartToLibrary(
  payload: SavePartPayload
): { ok: boolean; entry?: SavedPartEntry; error?: string } {
  try {
    const dir = PARTS_LIB_DIR();
    fs.mkdirSync(dir, { recursive: true });

    const id = `part_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const kn5Path = path.join(dir, `${id}.kn5`);
    fs.writeFileSync(kn5Path, Buffer.from(payload.kn5Bytes));

    const entry: SavedPartEntry = {
      id,
      name: payload.name.trim() || payload.sourceNodeName || 'Saved Part',
      category: payload.category,
      sourceCarId: payload.sourceCarId,
      sourceNodeName: payload.sourceNodeName,
      sourceSide: payload.sourceSide,
      bboxSize: payload.bboxSize,
      sizeBytes: payload.kn5Bytes.byteLength,
      createdAt: new Date().toISOString(),
      thumbnailDataUrl: payload.thumbnailDataUrl,
    };

    const list = listSavedParts();
    list.unshift(entry);
    fs.writeFileSync(PARTS_INDEX_FILE(), JSON.stringify(list, null, 2), 'utf8');

    return { ok: true, entry };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function loadSavedPartBytes(partId: string): Uint8Array | null {
  try {
    const safeId = path.basename(partId);
    const kn5Path = path.join(PARTS_LIB_DIR(), `${safeId}.kn5`);
    if (!fs.existsSync(kn5Path)) return null;
    const buf = fs.readFileSync(kn5Path);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch {
    return null;
  }
}

export function updateSavedPartMeta(
  partId: string,
  patch: { name?: string; category?: SavedPartEntry['category']; thumbnailDataUrl?: string }
): { ok: boolean; entry?: SavedPartEntry; error?: string } {
  try {
    const safeId = path.basename(partId);
    const list = listSavedParts();
    const target = list.find((p) => p.id === safeId);
    if (!target) {
      return { ok: false, error: '指定された保存モデルが見つかりません。' };
    }
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (trimmed) target.name = trimmed;
    }
    if (patch.category !== undefined) {
      target.category = patch.category;
    }
    if (patch.thumbnailDataUrl !== undefined) {
      target.thumbnailDataUrl = patch.thumbnailDataUrl;
    }
    fs.mkdirSync(PARTS_LIB_DIR(), { recursive: true });
    fs.writeFileSync(PARTS_INDEX_FILE(), JSON.stringify(list, null, 2), 'utf8');
    return { ok: true, entry: target };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function deleteSavedPart(partId: string): { ok: boolean; error?: string } {
  try {
    const safeId = path.basename(partId);
    const kn5Path = path.join(PARTS_LIB_DIR(), `${safeId}.kn5`);
    if (fs.existsSync(kn5Path)) fs.rmSync(kn5Path, { force: true });

    const list = listSavedParts().filter((p) => p.id !== safeId);
    fs.mkdirSync(PARTS_LIB_DIR(), { recursive: true });
    fs.writeFileSync(PARTS_INDEX_FILE(), JSON.stringify(list, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ===== Car Skins / Livery Studio I/O =====
export function listCarSkins(carsDir: string, carId: string): CarSkinSummary[] {
  const skinsDir = path.join(carsDir, carId, 'skins');
  if (!fs.existsSync(skinsDir)) return [];

  const result: CarSkinSummary[] = [];
  for (const entry of fs.readdirSync(skinsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sDir = path.join(skinsDir, entry.name);
    let ui: Record<string, unknown> = {};
    const uiPath = path.join(sDir, 'ui_skin.json');
    if (fs.existsSync(uiPath)) {
      try {
        ui = parseAcJson(fs.readFileSync(uiPath, 'utf8')) as Record<string, unknown>;
      } catch {
        ui = {};
      }
    }

    let previewDataUrl: string | undefined;
    const prevPath = path.join(sDir, 'preview.jpg');
    if (fs.existsSync(prevPath)) {
      try {
        const stat = fs.statSync(prevPath);
        if (stat.size <= 1_500_000) {
          previewDataUrl = `data:image/jpeg;base64,${fs.readFileSync(prevPath).toString('base64')}`;
        }
      } catch {
        // ignore
      }
    }

    const files = fs
      .readdirSync(sDir, { withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => f.name);

    result.push({
      id: entry.name,
      skinName: String(ui.skinname || entry.name),
      driverName: String(ui.drivername || ''),
      team: String(ui.team || ''),
      number: String(ui.number || ''),
      previewDataUrl,
      files,
    });
  }

  return result.sort((a, b) => a.id.localeCompare(b.id));
}

export function readCarSkinFile(
  carsDir: string,
  carId: string,
  skinId: string,
  fileName: string
): Uint8Array | null {
  const safeSkin = path.basename(skinId);
  const safeFile = path.basename(fileName);
  const full = path.join(carsDir, carId, 'skins', safeSkin, safeFile);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function saveCarSkin(
  carsDir: string,
  carId: string,
  payload: SaveSkinPayload
): { ok: boolean; skinId?: string; message: string } {
  try {
    const safeSkinId = payload.skinFolderId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
    if (!safeSkinId) {
      return { ok: false, message: '有効なスキンフォルダID（半角英数字・_・-）を入力してください。' };
    }

    const skinDir = path.join(carsDir, carId, 'skins', safeSkinId);
    fs.mkdirSync(skinDir, { recursive: true });

    // 1. Main body / target texture (.dds or .png)
    const safeTexName = path.basename(payload.textureFileName || 'skin_body.dds');
    fs.writeFileSync(path.join(skinDir, safeTexName), Buffer.from(payload.textureBytes));

    // 2. CSP skin-local ext_config.ini (material preset overrides without altering KN5)
    if (payload.extConfigIni.trim()) {
      fs.writeFileSync(path.join(skinDir, 'ext_config.ini'), payload.extConfigIni, 'utf8');
    }

    // 2b. Optional extra material detail/normal DDS files (e.g. carbon_detail.dds, carbon_detail_nm.dds)
    if (payload.extraFiles && payload.extraFiles.length > 0) {
      for (const extra of payload.extraFiles) {
        const safeExtra = path.basename(extra.fileName);
        if (!safeExtra) continue;
        fs.writeFileSync(path.join(skinDir, safeExtra), Buffer.from(extra.bytes));
      }
    }

    // 3. ui_skin.json
    const uiSkin = {
      skinname: payload.skinName.trim() || safeSkinId,
      drivername: payload.driverName.trim(),
      country: payload.country.trim() || 'Japan',
      team: payload.team.trim(),
      number: payload.number.trim() || '01',
    };
    fs.writeFileSync(path.join(skinDir, 'ui_skin.json'), JSON.stringify(uiSkin, null, 2), 'utf8');

    // 4. preview.jpg (captured live from 3D CSP viewport)
    if (payload.previewJpegBytes && payload.previewJpegBytes.byteLength > 100) {
      fs.writeFileSync(path.join(skinDir, 'preview.jpg'), Buffer.from(payload.previewJpegBytes));
    }

    // 5. livery.png (badge swatch for Content Manager / AC menu)
    if (payload.liveryPngBytes && payload.liveryPngBytes.byteLength > 100) {
      fs.writeFileSync(path.join(skinDir, 'livery.png'), Buffer.from(payload.liveryPngBytes));
    }

    return {
      ok: true,
      skinId: safeSkinId,
      message: `スキン「${uiSkin.skinname}」を skins/${safeSkinId}/ に書き出しました (${safeTexName} + ext_config.ini + preview.jpg + livery.png)`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
