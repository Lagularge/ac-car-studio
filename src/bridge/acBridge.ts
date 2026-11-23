import type {
  AcServerLogEvent,
  AcServerSavePayload,
  AppUpdateCheckResult,
  AppUpdateProgressEvent,
  CreateCarPayload,
  CustomPresetRecord,
  ElectronAcApi,
  ExternalModelFile,
  SavePartPayload,
  SaveSkinPayload,
  SoundExportPayload,
} from '../types/ac';

// ============================================================================
// Lightweight Native WebView2 Bridge (implements window.acApi 100% identically
// to Electron preload, using WebMessage JSON RPC + Zero-Base64 Binary HTTP)
// ============================================================================

interface WebView2Host {
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'message', listener: (ev: { data: unknown }) => void) => void;
  removeEventListener: (type: 'message', listener: (ev: { data: unknown }) => void) => void;
}

declare global {
  interface Window {
    chrome?: {
      webview?: WebView2Host;
    };
  }
}

const BIN_ORIGIN = 'https://app.accarstudio.local/__bin';

function packBinaryBundle(
  meta: Record<string, unknown>,
  blobs: Array<{ key: string; bytes: Uint8Array }>
): Uint8Array {
  const enc = new TextEncoder();
  const metaBytes = enc.encode(JSON.stringify(meta));
  const encodedBlobs = blobs.map((b) => ({
    keyBytes: enc.encode(b.key),
    bytes: b.bytes,
  }));

  let totalLen = 4 + metaBytes.byteLength + 4;
  for (const b of encodedBlobs) {
    totalLen += 4 + b.keyBytes.byteLength + 4 + b.bytes.byteLength;
  }

  const out = new Uint8Array(totalLen);
  const view = new DataView(out.buffer);
  let off = 0;

  view.setInt32(off, metaBytes.byteLength, true);
  off += 4;
  out.set(metaBytes, off);
  off += metaBytes.byteLength;

  view.setInt32(off, encodedBlobs.length, true);
  off += 4;

  for (const b of encodedBlobs) {
    view.setInt32(off, b.keyBytes.byteLength, true);
    off += 4;
    out.set(b.keyBytes, off);
    off += b.keyBytes.byteLength;

    view.setInt32(off, b.bytes.byteLength, true);
    off += 4;
    out.set(b.bytes, off);
    off += b.bytes.byteLength;
  }

  return out;
}

function buildQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function getDemoCarPayloads(): Array<{ payload: CreateCarPayload; packAsAcdOnly?: boolean }> {
  return [
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
}

export function ensureAcApiBridge(): void {
  if (typeof window === 'undefined') return;
  if (window.acApi) return; // Already injected by Electron preload

  const wv = window.chrome?.webview;
  if (!wv) return;

  let rpcSeq = 1;
  const pending = new Map<
    string,
    { resolve: (val: unknown) => void; reject: (err: Error) => void }
  >();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  wv.addEventListener('message', (ev) => {
    const msg = (typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data) as {
      type?: string;
      id?: string;
      ok?: boolean;
      result?: unknown;
      error?: string;
      channel?: string;
      payload?: unknown;
    };
    if (!msg) return;

    if (msg.type === 'rpc_result' && msg.id) {
      const slot = pending.get(msg.id);
      if (slot) {
        pending.delete(msg.id);
        if (msg.ok) slot.resolve(msg.result);
        else slot.reject(new Error(msg.error || 'Native RPC error'));
      }
      return;
    }

    if (msg.type === 'event' && msg.channel) {
      const set = listeners.get(msg.channel);
      if (set) {
        for (const fn of set) fn(msg.payload);
      }
    }
  });

  function rpc<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    const id = `r_${rpcSeq++}_${Date.now()}`;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      wv!.postMessage({ type: 'rpc', id, method, args });
    });
  }

  function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
    let set = listeners.get(channel);
    if (!set) {
      set = new Set();
      listeners.set(channel, set);
    }
    const wrapped = (p: unknown) => cb(p as T);
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  async function fetchBinGet(action: string, params: Record<string, string>): Promise<Uint8Array | null> {
    const res = await fetch(`${BIN_ORIGIN}/${action}?${buildQuery(params)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Binary fetch failed (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async function fetchBinPostJson<T>(
    action: string,
    params: Record<string, string>,
    body: Uint8Array
  ): Promise<T> {
    const res = await fetch(`${BIN_ORIGIN}/${action}?${buildQuery(params)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: body as unknown as BodyInit,
    });
    return (await res.json()) as T;
  }

  async function pickExternalFile(method: 'pickExternalModelFilePath' | 'pickExternalTextureFilePath'): Promise<ExternalModelFile | null> {
    const filePath = await rpc<string | null>(method);
    if (!filePath) return null;
    const bytes = await fetchBinGet('readExternalFileBytes', { filePath });
    if (!bytes) return null;
    const parts = filePath.split(/[\\/]/);
    const fileName = parts[parts.length - 1] || 'file';
    const dot = fileName.lastIndexOf('.');
    const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
    return { fileName, ext, bytes };
  }

  const api: ElectronAcApi = {
    detectAcDir: () => rpc('detectAcDir'),
    selectCarsDir: () => rpc('selectCarsDir'),
    createDemoWorkspace: async () => {
      const { buildNewCarFiles } = await import('../../electron/services/carTemplates');
      const demoSpecs = getDemoCarPayloads().map(({ payload, packAsAcdOnly }) => {
        const built = buildNewCarFiles(payload);
        return {
          folderName: payload.folderName,
          files: built.files,
          uiCarJson: built.uiCarJson,
          packAsAcdOnly: !!packAsAcdOnly,
        };
      });
      return rpc<string>('createDemoWorkspaceFromList', { demoSpecs });
    },
    listCars: (carsDir) => rpc('listCars', { carsDir }),
    loadCar: (carsDir, carId) => rpc('loadCar', { carsDir, carId }),
    saveCar: (carsDir, carId, files, uiCarJson, options) =>
      rpc('saveCar', { carsDir, carId, files, uiCarJson, options }),
    unpackAcd: (carsDir, carId) => rpc('unpackAcd', { carsDir, carId }),
    packAcd: (carsDir, carId, backupOldAcd = true) =>
      rpc('packAcd', { carsDir, carId, backupOldAcd }),
    createCar: async (carsDir, payload) => {
      const { buildNewCarFiles } = await import('../../electron/services/carTemplates');
      const folderName = payload.folderName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');
      const built = buildNewCarFiles({ ...payload, folderName });
      const uiSkinJson = {
        skinname: 'Default',
        drivername: '',
        country: payload.country || 'Japan',
        team: payload.brand || '',
        number: '01',
      };
      return rpc('createCarFromFiles', {
        carsDir,
        folderName,
        files: built.files,
        uiCarJson: built.uiCarJson,
        uiSkinJson,
      });
    },
    listBackups: (carsDir, carId) => rpc('listBackups', { carsDir, carId }),
    createBackup: (carsDir, carId, note) => rpc('createBackup', { carsDir, carId, note }),
    restoreBackup: (carsDir, carId, backupId) => rpc('restoreBackup', { carsDir, carId, backupId }),
    deleteBackup: (carsDir, carId, backupId) => rpc('deleteBackup', { carsDir, carId, backupId }),
    loadBackupData: (carsDir, carId, backupId) => rpc('loadBackupData', { carsDir, carId, backupId }),
    openCarFolder: async (carsDir, carId) => {
      await rpc('openCarFolder', { carsDir, carId });
    },
    loadCustomPresets: () => rpc<CustomPresetRecord[]>('loadCustomPresets'),
    saveCustomPresets: (presets) => rpc<boolean>('saveCustomPresets', { presets }),

    // 3D Models
    listCarModels: (carsDir, carId) => rpc('listCarModels', { carsDir, carId }),
    readCarModelBytes: (carsDir, carId, fileName) =>
      fetchBinGet('readCarModelBytes', { carsDir, carId, fileName }),
    saveCarModelBytes: (carsDir, carId, fileName, bytes, updateLodsIni = true) =>
      fetchBinPostJson(
        'saveCarModelBytes',
        { carsDir, carId, fileName, updateLodsIni: updateLodsIni ? '1' : '0' },
        bytes
      ),
    replaceModelFromCar: (carsDir, targetCarId, sourceCarId, sourceFileName) =>
      rpc('replaceModelFromCar', { carsDir, targetCarId, sourceCarId, sourceFileName }),
    pickExternalModelFile: () => pickExternalFile('pickExternalModelFilePath'),
    pickExternalTextureFile: () => pickExternalFile('pickExternalTextureFilePath'),

    // Parts Library
    listSavedParts: () => rpc('listSavedParts'),
    savePartToLibrary: (payload: SavePartPayload) => {
      const { kn5Bytes, ...meta } = payload;
      const body = packBinaryBundle(meta as unknown as Record<string, unknown>, [
        { key: 'kn5Bytes', bytes: kn5Bytes },
      ]);
      return fetchBinPostJson('savePartToLibrary', {}, body);
    },
    loadSavedPartBytes: (partId) => fetchBinGet('loadSavedPartBytes', { partId }),
    updateSavedPartMeta: (partId, patch) => rpc('updateSavedPartMeta', { partId, patch }),
    deleteSavedPart: (partId) => rpc('deleteSavedPart', { partId }),

    // Skins / Livery Studio
    listCarSkins: (carsDir, carId) => rpc('listCarSkins', { carsDir, carId }),
    readCarSkinFile: (carsDir, carId, skinId, fileName) =>
      fetchBinGet('readCarSkinFile', { carsDir, carId, skinId, fileName }),
    saveCarSkin: (carsDir, carId, payload: SaveSkinPayload) => {
      const blobs: Array<{ key: string; bytes: Uint8Array }> = [
        { key: '__mainTexture', bytes: payload.textureBytes },
      ];
      if (payload.previewJpegBytes) blobs.push({ key: '__previewJpeg', bytes: payload.previewJpegBytes });
      if (payload.liveryPngBytes) blobs.push({ key: '__liveryPng', bytes: payload.liveryPngBytes });
      if (payload.extraFiles) {
        for (const extra of payload.extraFiles) {
          blobs.push({ key: `extra:${extra.fileName}`, bytes: extra.bytes });
        }
      }
      const meta = {
        skinFolderId: payload.skinFolderId,
        skinName: payload.skinName,
        driverName: payload.driverName,
        team: payload.team,
        country: payload.country,
        number: payload.number,
        textureFileName: payload.textureFileName,
        extConfigIni: payload.extConfigIni,
      };
      return fetchBinPostJson('saveCarSkin', { carsDir, carId }, packBinaryBundle(meta, blobs));
    },
    pickDecalImageFile: () => rpc('pickDecalImageFile'),

    // Sound Export
    exportEngineSoundPack: (carsDir, carId, payload: SoundExportPayload) => {
      const blobs = payload.samples.map((s) => ({ key: s.fileName, bytes: s.wavBytes }));
      const meta = {
        engineName: payload.engineName,
        layoutLabel: payload.layoutLabel,
        maxRpm: payload.maxRpm,
        idleRpm: payload.idleRpm,
        manifestJson: payload.manifestJson,
        extConfigIni: payload.extConfigIni,
        cspLuaScript: payload.cspLuaScript,
        soundsIniPatch: payload.soundsIniPatch,
        samplesMeta: payload.samples.map((s) => ({
          fileName: s.fileName,
          rpm: s.rpm,
          loadType: s.loadType,
          perspective: s.perspective,
        })),
      };
      return fetchBinPostJson('exportEngineSoundPack', { carsDir, carId }, packBinaryBundle(meta, blobs));
    },
    removeCustomEngineSound: (carsDir, carId) => rpc('removeCustomEngineSound', { carsDir, carId }),
    copySoundBankFromCar: (carsDir, targetCarId, sourceCarId) =>
      rpc('copySoundBankFromCar', { carsDir, targetCarId, sourceCarId }),

    // AC Dedicated Server
    detectServerDir: (carsDir) => rpc('detectServerDir', { carsDir: carsDir ?? null }),
    selectServerDir: () => rpc('selectServerDir'),
    listInstalledTracks: (carsDir, serverDir) =>
      rpc('listInstalledTracks', { carsDir: carsDir ?? null, serverDir: serverDir ?? null }),
    readServerConfig: (serverDir) => rpc('readServerConfig', { serverDir }),
    saveServerConfig: (serverDir, payload: AcServerSavePayload) =>
      rpc('saveServerConfig', { serverDir, payload }),
    startAcServer: (serverDir) => rpc('startAcServer', { serverDir }),
    stopAcServer: () => rpc('stopAcServer'),
    getAcServerStatus: () => rpc('getAcServerStatus'),
    openServerFolder: async (serverDir) => {
      await rpc('openServerFolder', { serverDir });
    },
    onServerLog: (cb) => subscribe<AcServerLogEvent>('ac:serverLog', cb),
    onServerExit: (cb) => subscribe<{ code: number | null; signal: string | null }>('ac:serverExit', cb),

    // GitHub Auto-Update
    getAppVersion: () => rpc<string>('getAppVersion'),
    checkForUpdates: () => rpc<AppUpdateCheckResult>('checkForUpdates'),
    performAppUpdate: (info) => rpc('performAppUpdate', { info }),
    openExternalUrl: async (url) => {
      await rpc('openExternalUrl', { url });
    },
    onUpdateProgress: (cb) => subscribe<AppUpdateProgressEvent>('ac:updateProgress', cb),

    // Windows Mouse Side Buttons Back / Forward
    onAppNavCommand: (cb) =>
      subscribe<'back' | 'forward'>('ac:appNavCommand', (dir) => {
        if (dir === 'back' || dir === 'forward') cb(dir);
      }),
  };

  window.acApi = api;
}
