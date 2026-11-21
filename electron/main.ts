import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as acService from './services/acFileService';
import * as serverManager from './services/serverManager';
import * as updateService from './services/updateService';
import type {
  AcServerSavePayload,
  AppUpdateCheckResult,
  CreateCarPayload,
  CustomPresetRecord,
  SavePartPayload,
  SaveSkinPayload,
  SoundExportPayload,
  UiCarJson,
} from '../src/types/ac';

let mainWindow: BrowserWindow | null = null;

function resolveAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function createWindow() {
  const appIcon = resolveAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#0b0e14',
    title: 'AC Car Studio — Assetto Corsa Vehicle Creator & Tuner',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const attachMouseNavAppCommand = (win: BrowserWindow) => {
    win.on('app-command', (_event, cmd) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (cmd === 'browser-backward') {
        mainWindow.webContents.send('ac:appNavCommand', 'back');
      } else if (cmd === 'browser-forward') {
        mainWindow.webContents.send('ac:appNavCommand', 'forward');
      }
    });
  };

  attachMouseNavAppCommand(mainWindow);

  // Allow detachable floating / pop-out editor panels to open as native child BrowserWindows
  mainWindow.webContents.setWindowOpenHandler(({ frameName }) => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 540,
        height: 780,
        minWidth: 360,
        minHeight: 380,
        backgroundColor: '#0b0e14',
        title: frameName || 'AC Car Studio — フローティング編集ウィンドウ',
        icon: appIcon,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      },
    };
  });

  mainWindow.webContents.on('did-create-window', (childWin) => {
    attachMouseNavAppCommand(childWin);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('close', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win !== mainWindow && !win.isDestroyed()) {
        win.close();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers() {
  ipcMain.handle('ac:detectDir', () => acService.detectAcCarsDir());

  ipcMain.handle('ac:selectDir', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Assetto Corsa の content/cars フォルダを選択',
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('ac:createDemoWorkspace', () => acService.createDemoWorkspace());

  ipcMain.handle('ac:listCars', (_e, carsDir: string) => acService.listCars(carsDir));

  ipcMain.handle('ac:loadCar', (_e, carsDir: string, carId: string) =>
    acService.loadCar(carsDir, carId)
  );

  ipcMain.handle(
    'ac:saveCar',
    (
      _e,
      carsDir: string,
      carId: string,
      files: Record<string, string>,
      uiCarJson: UiCarJson,
      options: { repackAcd?: boolean; createBackupFirst?: boolean; backupNote?: string }
    ) => acService.saveCar(carsDir, carId, files, uiCarJson, options)
  );

  ipcMain.handle('ac:unpackAcd', (_e, carsDir: string, carId: string) =>
    acService.unpackAcd(carsDir, carId)
  );

  ipcMain.handle('ac:packAcd', (_e, carsDir: string, carId: string, backupOldAcd?: boolean) =>
    acService.packAcd(carsDir, carId, backupOldAcd)
  );

  ipcMain.handle('ac:createCar', (_e, carsDir: string, payload: CreateCarPayload) =>
    acService.createCar(carsDir, payload)
  );

  ipcMain.handle('ac:listBackups', (_e, carsDir: string, carId: string) =>
    acService.listBackups(carsDir, carId)
  );

  ipcMain.handle('ac:createBackup', (_e, carsDir: string, carId: string, note: string) =>
    acService.createBackup(carsDir, carId, note)
  );

  ipcMain.handle('ac:restoreBackup', (_e, carsDir: string, carId: string, backupId: string) =>
    acService.restoreBackup(carsDir, carId, backupId)
  );

  ipcMain.handle('ac:deleteBackup', (_e, carsDir: string, carId: string, backupId: string) =>
    acService.deleteBackup(carsDir, carId, backupId)
  );

  ipcMain.handle('ac:loadBackupData', (_e, carsDir: string, carId: string, backupId: string) =>
    acService.loadBackupData(carsDir, carId, backupId)
  );

  ipcMain.handle('ac:openCarFolder', async (_e, carsDir: string, carId: string) => {
    const target = path.join(carsDir, carId);
    await shell.openPath(target);
  });

  ipcMain.handle('ac:loadCustomPresets', () => acService.loadCustomPresets());

  ipcMain.handle('ac:saveCustomPresets', (_e, presets: CustomPresetRecord[]) =>
    acService.saveCustomPresets(presets)
  );

  // 3D Model APIs
  ipcMain.handle('ac:listCarModels', (_e, carsDir: string, carId: string) =>
    acService.listCarModels(carsDir, carId)
  );

  ipcMain.handle('ac:readCarModelBytes', (_e, carsDir: string, carId: string, fileName: string) =>
    acService.readCarModelBytes(carsDir, carId, fileName)
  );

  ipcMain.handle(
    'ac:saveCarModelBytes',
    (_e, carsDir: string, carId: string, fileName: string, bytes: Uint8Array, updateLodsIni?: boolean) =>
      acService.saveCarModelBytes(carsDir, carId, fileName, bytes, updateLodsIni)
  );

  ipcMain.handle(
    'ac:replaceModelFromCar',
    (_e, carsDir: string, targetCarId: string, sourceCarId: string, sourceFileName: string) =>
      acService.replaceModelFromCar(carsDir, targetCarId, sourceCarId, sourceFileName)
  );

  ipcMain.handle('ac:pickExternalModelFile', async () => {
    const res = await dialog.showOpenDialog({
      title: '3Dモデルファイル (.kn5 / .fbx / .glb / .gltf / .obj) を選択',
      properties: ['openFile'],
      filters: [
        { name: '3D Models (KN5, FBX, GLB, OBJ)', extensions: ['kn5', 'fbx', 'glb', 'gltf', 'obj'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    const buf = fs.readFileSync(filePath);
    return {
      fileName: path.basename(filePath),
      ext: path.extname(filePath).toLowerCase(),
      bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    };
  });

  ipcMain.handle('ac:pickExternalTextureFile', async () => {
    const res = await dialog.showOpenDialog({
      title: 'テクスチャファイル (.dds / .png / .jpg) を選択',
      properties: ['openFile'],
      filters: [
        { name: 'Textures (DDS, PNG, JPG)', extensions: ['dds', 'png', 'jpg', 'jpeg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    const buf = fs.readFileSync(filePath);
    return {
      fileName: path.basename(filePath),
      ext: path.extname(filePath).toLowerCase(),
      bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    };
  });

  // Sound Export APIs
  ipcMain.handle(
    'ac:exportEngineSoundPack',
    (_e, carsDir: string, carId: string, payload: SoundExportPayload) =>
      acService.exportEngineSoundPack(carsDir, carId, payload)
  );

  ipcMain.handle(
    'ac:removeCustomEngineSound',
    (_e, carsDir: string, carId: string) =>
      acService.removeCustomEngineSound(carsDir, carId)
  );

  ipcMain.handle(
    'ac:copySoundBankFromCar',
    (_e, carsDir: string, targetCarId: string, sourceCarId: string) =>
      acService.copySoundBankFromCar(carsDir, targetCarId, sourceCarId)
  );

  // Parts Library APIs
  ipcMain.handle('ac:listSavedParts', () => acService.listSavedParts());
  ipcMain.handle('ac:savePartToLibrary', (_e, payload: SavePartPayload) =>
    acService.savePartToLibrary(payload)
  );
  ipcMain.handle('ac:loadSavedPartBytes', (_e, partId: string) =>
    acService.loadSavedPartBytes(partId)
  );
  ipcMain.handle(
    'ac:updateSavedPartMeta',
    (_e, partId: string, patch: { name?: string; category?: string; thumbnailDataUrl?: string }) =>
      acService.updateSavedPartMeta(
        partId,
        patch as {
          name?: string;
          category?: import('../src/types/ac').PartCategory;
          thumbnailDataUrl?: string;
        }
      )
  );
  ipcMain.handle('ac:deleteSavedPart', (_e, partId: string) =>
    acService.deleteSavedPart(partId)
  );

  // Skin / Livery Studio APIs
  ipcMain.handle('ac:listCarSkins', (_e, carsDir: string, carId: string) =>
    acService.listCarSkins(carsDir, carId)
  );
  ipcMain.handle(
    'ac:readCarSkinFile',
    (_e, carsDir: string, carId: string, skinId: string, fileName: string) =>
      acService.readCarSkinFile(carsDir, carId, skinId, fileName)
  );
  ipcMain.handle('ac:saveCarSkin', (_e, carsDir: string, carId: string, payload: SaveSkinPayload) =>
    acService.saveCarSkin(carsDir, carId, payload)
  );
  ipcMain.handle('ac:pickDecalImageFile', async () => {
    const res = await dialog.showOpenDialog({
      title: 'デカール・貼り付け画像 (.png / .jpg / .webp) を選択',
      properties: ['openFile'],
      filters: [
        { name: 'Images (PNG, JPG, WEBP)', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const b64 = fs.readFileSync(filePath).toString('base64');
    return {
      fileName: path.basename(filePath),
      dataUrl: `data:${mime};base64,${b64}`,
    };
  });

  // Assetto Corsa Dedicated Server APIs
  ipcMain.handle('ac:detectServerDir', (_e, carsDir?: string | null) =>
    serverManager.detectAcServerDir(carsDir)
  );
  ipcMain.handle('ac:selectServerDir', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Assetto Corsa の server フォルダ (acServer.exe がある場所) を選択',
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });
  ipcMain.handle(
    'ac:listInstalledTracks',
    (_e, carsDir?: string | null, serverDir?: string | null) =>
      serverManager.listInstalledTracks(carsDir, serverDir)
  );
  ipcMain.handle('ac:readServerConfig', (_e, serverDir: string) =>
    serverManager.readServerConfig(serverDir)
  );
  ipcMain.handle(
    'ac:saveServerConfig',
    (_e, serverDir: string, payload: AcServerSavePayload) =>
      serverManager.saveServerConfig(serverDir, payload)
  );
  ipcMain.handle('ac:startAcServer', (_e, serverDir: string) =>
    serverManager.startAcServer(
      serverDir,
      (ev) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ac:serverLog', ev);
        }
      },
      (info) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ac:serverExit', info);
        }
      }
    )
  );
  ipcMain.handle('ac:stopAcServer', () => serverManager.stopAcServer());
  ipcMain.handle('ac:getAcServerStatus', () => serverManager.getAcServerStatus());
  ipcMain.handle('ac:openServerFolder', async (_e, serverDir: string) => {
    await shell.openPath(serverDir);
  });

  // GitHub Auto-Update APIs
  ipcMain.handle('ac:getAppVersion', () => updateService.getAppVersion());
  ipcMain.handle('ac:checkForUpdates', () => updateService.checkForGitHubUpdates());
  ipcMain.handle('ac:performAppUpdate', (_e, info: AppUpdateCheckResult) =>
    updateService.performAppUpdate(info, (ev) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ac:updateProgress', ev);
      }
    })
  );
  ipcMain.handle('ac:openExternalUrl', async (_e, url: string) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) {
      await shell.openExternal(url);
    }
  });
}

app.on('before-quit', () => {
  serverManager.stopAcServer();
});

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
