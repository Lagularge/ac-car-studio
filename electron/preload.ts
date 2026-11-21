import { contextBridge, ipcRenderer } from 'electron';
import type {
  AcServerLogEvent,
  AcServerSavePayload,
  CreateCarPayload,
  CustomPresetRecord,
  ElectronAcApi,
  SavePartPayload,
  SaveSkinPayload,
  SoundExportPayload,
  UiCarJson,
} from '../src/types/ac';

const api: ElectronAcApi = {
  detectAcDir: () => ipcRenderer.invoke('ac:detectDir'),
  selectCarsDir: () => ipcRenderer.invoke('ac:selectDir'),
  createDemoWorkspace: () => ipcRenderer.invoke('ac:createDemoWorkspace'),
  listCars: (carsDir: string) => ipcRenderer.invoke('ac:listCars', carsDir),
  loadCar: (carsDir: string, carId: string) => ipcRenderer.invoke('ac:loadCar', carsDir, carId),
  saveCar: (
    carsDir: string,
    carId: string,
    files: Record<string, string>,
    uiCarJson: UiCarJson,
    options: { repackAcd?: boolean; createBackupFirst?: boolean; backupNote?: string }
  ) => ipcRenderer.invoke('ac:saveCar', carsDir, carId, files, uiCarJson, options),
  unpackAcd: (carsDir: string, carId: string) => ipcRenderer.invoke('ac:unpackAcd', carsDir, carId),
  packAcd: (carsDir: string, carId: string, backupOldAcd?: boolean) =>
    ipcRenderer.invoke('ac:packAcd', carsDir, carId, backupOldAcd),
  createCar: (carsDir: string, payload: CreateCarPayload) =>
    ipcRenderer.invoke('ac:createCar', carsDir, payload),
  listBackups: (carsDir: string, carId: string) =>
    ipcRenderer.invoke('ac:listBackups', carsDir, carId),
  createBackup: (carsDir: string, carId: string, note: string) =>
    ipcRenderer.invoke('ac:createBackup', carsDir, carId, note),
  restoreBackup: (carsDir: string, carId: string, backupId: string) =>
    ipcRenderer.invoke('ac:restoreBackup', carsDir, carId, backupId),
  deleteBackup: (carsDir: string, carId: string, backupId: string) =>
    ipcRenderer.invoke('ac:deleteBackup', carsDir, carId, backupId),
  loadBackupData: (carsDir: string, carId: string, backupId: string) =>
    ipcRenderer.invoke('ac:loadBackupData', carsDir, carId, backupId),
  openCarFolder: (carsDir: string, carId: string) =>
    ipcRenderer.invoke('ac:openCarFolder', carsDir, carId),
  loadCustomPresets: () => ipcRenderer.invoke('ac:loadCustomPresets'),
  saveCustomPresets: (presets: CustomPresetRecord[]) =>
    ipcRenderer.invoke('ac:saveCustomPresets', presets),
  listCarModels: (carsDir: string, carId: string) =>
    ipcRenderer.invoke('ac:listCarModels', carsDir, carId),
  readCarModelBytes: (carsDir: string, carId: string, fileName: string) =>
    ipcRenderer.invoke('ac:readCarModelBytes', carsDir, carId, fileName),
  saveCarModelBytes: (
    carsDir: string,
    carId: string,
    fileName: string,
    bytes: Uint8Array,
    updateLodsIni?: boolean
  ) => ipcRenderer.invoke('ac:saveCarModelBytes', carsDir, carId, fileName, bytes, updateLodsIni),
  replaceModelFromCar: (
    carsDir: string,
    targetCarId: string,
    sourceCarId: string,
    sourceFileName: string
  ) => ipcRenderer.invoke('ac:replaceModelFromCar', carsDir, targetCarId, sourceCarId, sourceFileName),
  pickExternalModelFile: () => ipcRenderer.invoke('ac:pickExternalModelFile'),
  pickExternalTextureFile: () => ipcRenderer.invoke('ac:pickExternalTextureFile'),
  listSavedParts: () => ipcRenderer.invoke('ac:listSavedParts'),
  savePartToLibrary: (payload: SavePartPayload) =>
    ipcRenderer.invoke('ac:savePartToLibrary', payload),
  loadSavedPartBytes: (partId: string) => ipcRenderer.invoke('ac:loadSavedPartBytes', partId),
  updateSavedPartMeta: (
    partId: string,
    patch: { name?: string; category?: string; thumbnailDataUrl?: string }
  ) => ipcRenderer.invoke('ac:updateSavedPartMeta', partId, patch),
  deleteSavedPart: (partId: string) => ipcRenderer.invoke('ac:deleteSavedPart', partId),
  listCarSkins: (carsDir: string, carId: string) =>
    ipcRenderer.invoke('ac:listCarSkins', carsDir, carId),
  readCarSkinFile: (carsDir: string, carId: string, skinId: string, fileName: string) =>
    ipcRenderer.invoke('ac:readCarSkinFile', carsDir, carId, skinId, fileName),
  saveCarSkin: (carsDir: string, carId: string, payload: SaveSkinPayload) =>
    ipcRenderer.invoke('ac:saveCarSkin', carsDir, carId, payload),
  pickDecalImageFile: () => ipcRenderer.invoke('ac:pickDecalImageFile'),
  exportEngineSoundPack: (carsDir: string, carId: string, payload: SoundExportPayload) =>
    ipcRenderer.invoke('ac:exportEngineSoundPack', carsDir, carId, payload),
  removeCustomEngineSound: (carsDir: string, carId: string) =>
    ipcRenderer.invoke('ac:removeCustomEngineSound', carsDir, carId),
  copySoundBankFromCar: (carsDir: string, targetCarId: string, sourceCarId: string) =>
    ipcRenderer.invoke('ac:copySoundBankFromCar', carsDir, targetCarId, sourceCarId),
  detectServerDir: (carsDir?: string | null) =>
    ipcRenderer.invoke('ac:detectServerDir', carsDir),
  selectServerDir: () => ipcRenderer.invoke('ac:selectServerDir'),
  listInstalledTracks: (carsDir?: string | null, serverDir?: string | null) =>
    ipcRenderer.invoke('ac:listInstalledTracks', carsDir, serverDir),
  readServerConfig: (serverDir: string) => ipcRenderer.invoke('ac:readServerConfig', serverDir),
  saveServerConfig: (serverDir: string, payload: AcServerSavePayload) =>
    ipcRenderer.invoke('ac:saveServerConfig', serverDir, payload),
  startAcServer: (serverDir: string) => ipcRenderer.invoke('ac:startAcServer', serverDir),
  stopAcServer: () => ipcRenderer.invoke('ac:stopAcServer'),
  getAcServerStatus: () => ipcRenderer.invoke('ac:getAcServerStatus'),
  openServerFolder: (serverDir: string) => ipcRenderer.invoke('ac:openServerFolder', serverDir),
  onServerLog: (callback: (event: AcServerLogEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AcServerLogEvent) => {
      callback(payload);
    };
    ipcRenderer.on('ac:serverLog', listener);
    return () => {
      ipcRenderer.removeListener('ac:serverLog', listener);
    };
  },
  onServerExit: (callback: (info: { code: number | null; signal: string | null }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      info: { code: number | null; signal: string | null }
    ) => {
      callback(info);
    };
    ipcRenderer.on('ac:serverExit', listener);
    return () => {
      ipcRenderer.removeListener('ac:serverExit', listener);
    };
  },
  onAppNavCommand: (callback: (direction: 'back' | 'forward') => void) => {
    const listener = (_event: Electron.IpcRendererEvent, direction: 'back' | 'forward') => {
      if (direction === 'back' || direction === 'forward') {
        callback(direction);
      }
    };
    ipcRenderer.on('ac:appNavCommand', listener);
    return () => {
      ipcRenderer.removeListener('ac:appNavCommand', listener);
    };
  },
};

contextBridge.exposeInMainWorld('acApi', api);
