using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AcCarStudioHost
{
    public sealed class NativeBridge
    {
        private readonly Form _ownerForm;
        private readonly Action<string, object> _emitEvent;
        private readonly Action _requestAppExit;

        public NativeBridge(Form ownerForm, Action<string, object> emitEvent, Action requestAppExit)
        {
            _ownerForm = ownerForm;
            _emitEvent = emitEvent;
            _requestAppExit = requestAppExit;
        }

        private T RunOnUi<T>(Func<T> func)
        {
            if (_ownerForm.InvokeRequired)
            {
                return (T)_ownerForm.Invoke(func);
            }
            return func();
        }

        public async Task<object> DispatchRpcAsync(string method, Dictionary<string, object> args)
        {
            args ??= new Dictionary<string, object>();

            switch (method)
            {
                case "detectAcDir":
                    return await Task.Run(() => AcFileService.DetectAcCarsDir());

                case "selectCarsDir":
                    return RunOnUi(() => PickFolderDialog("Assetto Corsa の content/cars フォルダを選択"));

                case "createDemoWorkspaceFromList":
                {
                    var specs = JsonHelper.GetList(args, "demoSpecs").OfType<Dictionary<string, object>>().ToList();
                    return await Task.Run(() => AcFileService.CreateDemoWorkspaceFromList(specs));
                }

                case "listCars":
                    return await Task.Run(() => AcFileService.ListCars(JsonHelper.GetString(args, "carsDir")));

                case "loadCar":
                    return await Task.Run(() => AcFileService.LoadCar(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId")));

                case "saveCar":
                {
                    string carsDir = JsonHelper.GetString(args, "carsDir");
                    string carId = JsonHelper.GetString(args, "carId");
                    var files = JsonHelper.GetStringMap(args, "files");
                    var uiCarJson = JsonHelper.GetDict(args, "uiCarJson") ?? new Dictionary<string, object>();
                    var opts = JsonHelper.GetDict(args, "options") ?? new Dictionary<string, object>();
                    return await Task.Run(() => AcFileService.SaveCar(
                        carsDir,
                        carId,
                        files,
                        uiCarJson,
                        JsonHelper.GetBool(opts, "repackAcd"),
                        JsonHelper.GetBool(opts, "createBackupFirst"),
                        JsonHelper.GetString(opts, "backupNote")));
                }

                case "unpackAcd":
                    return await Task.Run(() => AcFileService.UnpackAcd(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId")));

                case "packAcd":
                    return await Task.Run(() => AcFileService.PackAcd(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId"),
                        JsonHelper.GetBool(args, "backupOldAcd", true)));

                case "createCarFromFiles":
                    return await Task.Run(() => AcFileService.CreateCarFromFiles(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "folderName"),
                        JsonHelper.GetStringMap(args, "files"),
                        JsonHelper.GetDict(args, "uiCarJson"),
                        JsonHelper.GetDict(args, "uiSkinJson")));

                case "listBackups":
                    return await Task.Run(() => AcFileService.ListBackups(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId")));

                case "createBackup":
                    return await Task.Run(() => AcFileService.CreateBackup(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId"),
                        JsonHelper.GetString(args, "note")));

                case "restoreBackup":
                    return await Task.Run(() => AcFileService.RestoreBackup(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId"),
                        JsonHelper.GetString(args, "backupId")));

                case "deleteBackup":
                    return await Task.Run(() => AcFileService.DeleteBackup(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId"),
                        JsonHelper.GetString(args, "backupId")));

                case "loadBackupData":
                    return await Task.Run(() => AcFileService.LoadBackupData(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId"),
                        JsonHelper.GetString(args, "backupId")));

                case "openCarFolder":
                {
                    string target = Path.Combine(
                        JsonHelper.GetString(args, "carsDir"),
                        Path.GetFileName(JsonHelper.GetString(args, "carId")));
                    if (Directory.Exists(target)) Process.Start("explorer.exe", target);
                    return true;
                }

                case "loadCustomPresets":
                    return await Task.Run(() => AcFileService.LoadCustomPresets());

                case "saveCustomPresets":
                    return await Task.Run(() => AcFileService.SaveCustomPresets(args.ContainsKey("presets") ? args["presets"] : new object[0]));

                // 3D Models
                case "listCarModels":
                    return await Task.Run(() => AcFileService.ListCarModels(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId")));

                case "replaceModelFromCar":
                    return await Task.Run(() => AcFileService.ReplaceModelFromCar(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "targetCarId"),
                        JsonHelper.GetString(args, "sourceCarId"),
                        JsonHelper.GetString(args, "sourceFileName")));

                case "pickExternalModelFilePath":
                    return RunOnUi(() => PickOpenFileDialog(
                        "3Dモデルファイル (.kn5 / .fbx / .glb / .gltf / .obj) を選択",
                        "3D Models (*.kn5;*.fbx;*.glb;*.gltf;*.obj)|*.kn5;*.fbx;*.glb;*.gltf;*.obj|All Files (*.*)|*.*"));

                case "pickExternalTextureFilePath":
                    return RunOnUi(() => PickOpenFileDialog(
                        "テクスチャファイル (.dds / .png / .jpg) を選択",
                        "Textures (*.dds;*.png;*.jpg;*.jpeg)|*.dds;*.png;*.jpg;*.jpeg|All Files (*.*)|*.*"));

                case "pickDecalImageFile":
                    return RunOnUi(() =>
                    {
                        string filePath = PickOpenFileDialog(
                            "デカール・貼り付け画像 (.png / .jpg / .webp) を選択",
                            "Images (*.png;*.jpg;*.jpeg;*.webp)|*.png;*.jpg;*.jpeg;*.webp|All Files (*.*)|*.*");
                        if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return null;
                        string ext = Path.GetExtension(filePath).ToLowerInvariant();
                        string mime = ext == ".png" ? "image/png" : ext == ".webp" ? "image/webp" : "image/jpeg";
                        return new Dictionary<string, object>
                        {
                            ["fileName"] = Path.GetFileName(filePath),
                            ["dataUrl"] = $"data:{mime};base64,{Convert.ToBase64String(File.ReadAllBytes(filePath))}",
                        };
                    });

                // Parts Library
                case "listSavedParts":
                    return await Task.Run(() => AcFileService.ListSavedParts());

                case "updateSavedPartMeta":
                    return await Task.Run(() => AcFileService.UpdateSavedPartMeta(
                        JsonHelper.GetString(args, "partId"),
                        JsonHelper.GetDict(args, "patch") ?? new Dictionary<string, object>()));

                case "deleteSavedPart":
                    return await Task.Run(() => AcFileService.DeleteSavedPart(JsonHelper.GetString(args, "partId")));

                // Skins
                case "listCarSkins":
                    return await Task.Run(() => AcFileService.ListCarSkins(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId")));

                // Sound
                case "removeCustomEngineSound":
                    return await Task.Run(() => AcFileService.RemoveCustomEngineSound(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "carId")));

                case "copySoundBankFromCar":
                    return await Task.Run(() => AcFileService.CopySoundBankFromCar(
                        JsonHelper.GetString(args, "carsDir"),
                        JsonHelper.GetString(args, "targetCarId"),
                        JsonHelper.GetString(args, "sourceCarId")));

                // Dedicated Server
                case "detectServerDir":
                    return await Task.Run(() => ServerManager.DetectServerDir(JsonHelper.GetString(args, "carsDir", null)));

                case "selectServerDir":
                    return RunOnUi(() => PickFolderDialog("Assetto Corsa の server フォルダ (acServer.exe がある場所) を選択"));

                case "listInstalledTracks":
                    return await Task.Run(() => ServerManager.ListInstalledTracks(
                        JsonHelper.GetString(args, "carsDir", null),
                        JsonHelper.GetString(args, "serverDir", null)));

                case "readServerConfig":
                    return await Task.Run(() => ServerManager.ReadServerConfig(JsonHelper.GetString(args, "serverDir")));

                case "saveServerConfig":
                    return await Task.Run(() => ServerManager.SaveServerConfig(
                        JsonHelper.GetString(args, "serverDir"),
                        JsonHelper.GetDict(args, "payload") ?? new Dictionary<string, object>()));

                case "startAcServer":
                    return ServerManager.StartServer(
                        JsonHelper.GetString(args, "serverDir"),
                        ev => _emitEvent("ac:serverLog", ev),
                        info => _emitEvent("ac:serverExit", info));

                case "stopAcServer":
                    return ServerManager.StopServer();

                case "getAcServerStatus":
                    return ServerManager.GetStatus();

                case "openServerFolder":
                {
                    string dir = JsonHelper.GetString(args, "serverDir");
                    if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir)) Process.Start("explorer.exe", dir);
                    return true;
                }

                // Auto-Update
                case "getAppVersion":
                    return UpdateService.GetAppVersion();

                case "checkForUpdates":
                    return await UpdateService.CheckForUpdatesAsync();

                case "performAppUpdate":
                    return await UpdateService.PerformUpdateAsync(
                        JsonHelper.GetDict(args, "info") ?? new Dictionary<string, object>(),
                        ev => _emitEvent("ac:updateProgress", ev),
                        _requestAppExit);

                case "openExternalUrl":
                {
                    string url = JsonHelper.GetString(args, "url");
                    if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                    {
                        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                    }
                    return true;
                }

                default:
                    throw new NotSupportedException("Unknown native bridge method: " + method);
            }
        }

        /// <summary>
        /// High-speed zero-base64 binary HTTP handler for KN5, DDS, WAV, PNG/JPG payloads.
        /// </summary>
        public (int statusCode, string contentType, byte[] body) HandleBinaryRequest(
            string action,
            Dictionary<string, string> query,
            byte[] requestBody)
        {
            try
            {
                string Q(string k) => query.TryGetValue(k, out string v) ? v : "";

                switch (action)
                {
                    case "readCarModelBytes":
                    {
                        byte[] data = AcFileService.ReadCarModelBytes(Q("carsDir"), Q("carId"), Q("fileName"));
                        if (data == null) return (404, "application/json", Encoding.UTF8.GetBytes("null"));
                        return (200, "application/octet-stream", data);
                    }

                    case "saveCarModelBytes":
                    {
                        var res = AcFileService.SaveCarModelBytes(
                            Q("carsDir"),
                            Q("carId"),
                            Q("fileName"),
                            requestBody ?? new byte[0],
                            Q("updateLodsIni") != "0");
                        return (200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(JsonHelper.Serialize(res)));
                    }

                    case "readExternalFileBytes":
                    {
                        string path = Q("filePath");
                        if (string.IsNullOrEmpty(path) || !File.Exists(path))
                            return (404, "application/json", Encoding.UTF8.GetBytes("null"));
                        return (200, "application/octet-stream", File.ReadAllBytes(path));
                    }

                    case "loadSavedPartBytes":
                    {
                        byte[] data = AcFileService.LoadSavedPartBytes(Q("partId"));
                        if (data == null) return (404, "application/json", Encoding.UTF8.GetBytes("null"));
                        return (200, "application/octet-stream", data);
                    }

                    case "readCarSkinFile":
                    {
                        byte[] data = AcFileService.ReadCarSkinFile(Q("carsDir"), Q("carId"), Q("skinId"), Q("fileName"));
                        if (data == null) return (404, "application/json", Encoding.UTF8.GetBytes("null"));
                        return (200, "application/octet-stream", data);
                    }

                    case "savePartToLibrary":
                    {
                        var (meta, blobs) = UnpackBinaryBundle(requestBody);
                        byte[] kn5 = blobs.TryGetValue("kn5Bytes", out byte[] b) ? b : new byte[0];
                        var res = AcFileService.SavePartToLibrary(meta, kn5);
                        return (200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(JsonHelper.Serialize(res)));
                    }

                    case "saveCarSkin":
                    {
                        var (meta, blobs) = UnpackBinaryBundle(requestBody);
                        var res = AcFileService.SaveCarSkin(Q("carsDir"), Q("carId"), meta, blobs);
                        return (200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(JsonHelper.Serialize(res)));
                    }

                    case "exportEngineSoundPack":
                    {
                        var (meta, blobs) = UnpackBinaryBundle(requestBody);
                        var res = AcFileService.ExportEngineSoundPack(Q("carsDir"), Q("carId"), meta, blobs);
                        return (200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(JsonHelper.Serialize(res)));
                    }

                    default:
                        return (404, "application/json", Encoding.UTF8.GetBytes("{\"error\":\"unknown action\"}"));
                }
            }
            catch (Exception ex)
            {
                string err = JsonHelper.Serialize(new Dictionary<string, object> { ["ok"] = false, ["error"] = ex.Message, ["message"] = ex.Message });
                return (500, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(err));
            }
        }

        /// <summary>
        /// Decodes a compact framed binary bundle:
        /// [uint32 metaJsonLen][metaJsonUtf8][uint32 blobCount]
        /// repeated: [uint32 keyLen][keyUtf8][uint32 dataLen][dataBytes]
        /// </summary>
        private static (Dictionary<string, object> meta, Dictionary<string, byte[]> blobs) UnpackBinaryBundle(byte[] raw)
        {
            var meta = new Dictionary<string, object>();
            var blobs = new Dictionary<string, byte[]>(StringComparer.Ordinal);
            if (raw == null || raw.Length < 8) return (meta, blobs);

            using (var ms = new MemoryStream(raw))
            using (var br = new BinaryReader(ms, Encoding.UTF8))
            {
                int metaLen = br.ReadInt32();
                if (metaLen > 0 && metaLen <= raw.Length - 4)
                {
                    string metaJson = Encoding.UTF8.GetString(br.ReadBytes(metaLen));
                    meta = JsonHelper.DeserializeDict(metaJson);
                }
                if (ms.Position + 4 <= ms.Length)
                {
                    int blobCount = br.ReadInt32();
                    for (int i = 0; i < blobCount && ms.Position + 8 <= ms.Length; i++)
                    {
                        int keyLen = br.ReadInt32();
                        string key = Encoding.UTF8.GetString(br.ReadBytes(keyLen));
                        int dataLen = br.ReadInt32();
                        byte[] data = br.ReadBytes(dataLen);
                        blobs[key] = data;
                    }
                }
            }
            return (meta, blobs);
        }

        private string PickFolderDialog(string title)
        {
            using (var dlg = new FolderBrowserDialog())
            {
                dlg.Description = title;
                dlg.ShowNewFolderButton = true;
                return dlg.ShowDialog(_ownerForm) == DialogResult.OK ? dlg.SelectedPath : null;
            }
        }

        private string PickOpenFileDialog(string title, string filter)
        {
            using (var dlg = new OpenFileDialog())
            {
                dlg.Title = title;
                dlg.Filter = filter;
                dlg.CheckFileExists = true;
                return dlg.ShowDialog(_ownerForm) == DialogResult.OK ? dlg.FileName : null;
            }
        }
    }
}
