using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace AcCarStudioHost
{
    public static class AcFileService
    {
        private const string BackupDirName = "_ac_studio_backups";
        private const string SoundExtMarkerStart = "; === AC_CAR_STUDIO_ENGINE_SIM_SOUND_START ===";
        private const string SoundExtMarkerEnd = "; === AC_CAR_STUDIO_ENGINE_SIM_SOUND_END ===";
        private const string SoundLuaFileName = "ac_car_studio_engine_sound.lua";
        private const string SoundWavSubdir = "ac_car_studio_sound";

        public static string GetUserDataDir()
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "ac-car-studio"
            );
            Directory.CreateDirectory(dir);
            return dir;
        }

        private static string GetPartsLibDir()
        {
            string dir = Path.Combine(GetUserDataDir(), "parts_library");
            Directory.CreateDirectory(dir);
            return dir;
        }

        private static string GetPartsIndexFile() => Path.Combine(GetPartsLibDir(), "index.json");
        private static string GetPresetsFile() => Path.Combine(GetUserDataDir(), "custom_presets.json");

        public static Dictionary<string, object> DetectAcCarsDir()
        {
            var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                @"C:\Program Files (x86)\Steam\steamapps\common\assettocorsa\content\cars",
                @"C:\Program Files\Steam\steamapps\common\assettocorsa\content\cars",
                @"D:\SteamLibrary\steamapps\common\assettocorsa\content\cars",
                @"D:\Steam\steamapps\common\assettocorsa\content\cars",
                @"E:\SteamLibrary\steamapps\common\assettocorsa\content\cars",
                @"F:\SteamLibrary\steamapps\common\assettocorsa\content\cars",
                @"G:\SteamLibrary\steamapps\common\assettocorsa\content\cars",
            };

            foreach (string vdf in new[]
            {
                @"C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf",
                @"C:\Program Files\Steam\steamapps\libraryfolders.vdf",
            })
            {
                if (!File.Exists(vdf)) continue;
                try
                {
                    string txt = File.ReadAllText(vdf, Encoding.UTF8);
                    foreach (Match m in Regex.Matches(txt, @"""path""\s+""([^""]+)"""))
                    {
                        string lib = m.Groups[1].Value.Replace(@"\\", @"\");
                        candidates.Add(Path.Combine(lib, "steamapps", "common", "assettocorsa", "content", "cars"));
                    }
                }
                catch { }
            }

            var found = candidates.Where(Directory.Exists).ToList();
            return new Dictionary<string, object>
            {
                ["carsDir"] = found.Count > 0 ? found[0] : null,
                ["candidates"] = found,
            };
        }

        public static string CreateDemoWorkspaceFromList(List<Dictionary<string, object>> demoSpecs)
        {
            string demoDir = Path.Combine(GetUserDataDir(), "demo_content_cars");
            Directory.CreateDirectory(demoDir);

            foreach (var spec in demoSpecs)
            {
                string folderName = Path.GetFileName(JsonHelper.GetString(spec, "folderName"));
                if (string.IsNullOrEmpty(folderName)) continue;
                string carDir = Path.Combine(demoDir, folderName);
                if (Directory.Exists(carDir)) continue;

                var files = JsonHelper.GetStringMap(spec, "files");
                var uiCarJson = JsonHelper.GetDict(spec, "uiCarJson") ?? new Dictionary<string, object>();
                bool packAsAcdOnly = JsonHelper.GetBool(spec, "packAsAcdOnly", false);

                Directory.CreateDirectory(Path.Combine(carDir, "ui"));
                File.WriteAllText(Path.Combine(carDir, "ui", "ui_car.json"), JsonHelper.Serialize(uiCarJson), Encoding.UTF8);

                if (packAsAcdOnly)
                {
                    var bufMap = files.ToDictionary(kv => kv.Key, kv => Encoding.UTF8.GetBytes(kv.Value));
                    var packed = AcdCodec.PackAcdBuffer(bufMap, folderName);
                    File.WriteAllBytes(Path.Combine(carDir, "data.acd"), packed.Buffer);
                }
                else
                {
                    string dataDir = Path.Combine(carDir, "data");
                    Directory.CreateDirectory(dataDir);
                    foreach (var kv in files)
                    {
                        File.WriteAllText(Path.Combine(dataDir, Path.GetFileName(kv.Key)), kv.Value, Encoding.UTF8);
                    }
                }
            }
            return demoDir;
        }

        private static string ReadBadgeImage(string carDir)
        {
            string badgePath = Path.Combine(carDir, "ui", "badge.png");
            try
            {
                var fi = new FileInfo(badgePath);
                if (fi.Exists && fi.Length <= 500_000)
                {
                    return "data:image/png;base64," + Convert.ToBase64String(File.ReadAllBytes(badgePath));
                }
            }
            catch { }
            return null;
        }

        private static string ReadPreviewImage(string carDir, string fallbackBadge)
        {
            string skinsDir = Path.Combine(carDir, "skins");
            if (Directory.Exists(skinsDir))
            {
                try
                {
                    foreach (string sDir in Directory.GetDirectories(skinsDir))
                    {
                        string prev = Path.Combine(sDir, "preview.jpg");
                        var fi = new FileInfo(prev);
                        if (fi.Exists && fi.Length <= 1_500_000)
                        {
                            return "data:image/jpeg;base64," + Convert.ToBase64String(File.ReadAllBytes(prev));
                        }
                    }
                }
                catch { }
            }
            return fallbackBadge ?? ReadBadgeImage(carDir);
        }

        private static int CountBackups(string carDir)
        {
            string bDir = Path.Combine(carDir, BackupDirName);
            if (!Directory.Exists(bDir)) return 0;
            try { return Directory.GetDirectories(bDir).Length; } catch { return 0; }
        }

        public static List<Dictionary<string, object>> ListCars(string carsDir)
        {
            var cars = new List<Dictionary<string, object>>();
            if (string.IsNullOrEmpty(carsDir) || !Directory.Exists(carsDir)) return cars;

            foreach (string carDir in Directory.GetDirectories(carsDir))
            {
                string id = Path.GetFileName(carDir);
                if (id.StartsWith(".") || id == BackupDirName) continue;

                string dataDir = Path.Combine(carDir, "data");
                string acdPath = Path.Combine(carDir, "data.acd");
                string uiJsonPath = Path.Combine(carDir, "ui", "ui_car.json");

                bool hasDataFolder = Directory.Exists(dataDir);
                bool hasDataAcd = File.Exists(acdPath);
                if (!hasDataFolder && !hasDataAcd && !File.Exists(uiJsonPath)) continue;

                var ui = File.Exists(uiJsonPath)
                    ? JsonHelper.ParseAcJson(File.ReadAllText(uiJsonPath, Encoding.UTF8))
                    : new Dictionary<string, object>();
                var specs = JsonHelper.GetDict(ui, "specs");
                string badge = ReadBadgeImage(carDir);

                cars.Add(new Dictionary<string, object>
                {
                    ["id"] = id,
                    ["name"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(ui, "name")) ? id : JsonHelper.GetString(ui, "name").Trim(),
                    ["brand"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(ui, "brand")) ? "Unknown" : JsonHelper.GetString(ui, "brand").Trim(),
                    ["carClass"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(ui, "class")) ? "street" : JsonHelper.GetString(ui, "class").Trim(),
                    ["year"] = JsonHelper.GetString(ui, "year", ""),
                    ["country"] = JsonHelper.GetString(ui, "country", "").Trim(),
                    ["hasDataFolder"] = hasDataFolder,
                    ["hasDataAcd"] = hasDataAcd,
                    ["dataSource"] = hasDataFolder ? "folder" : hasDataAcd ? "acd" : "none",
                    ["previewDataUrl"] = ReadPreviewImage(carDir, badge),
                    ["badgeDataUrl"] = badge,
                    ["bhpSpec"] = specs != null ? JsonHelper.GetString(specs, "bhp", null) : null,
                    ["torqueSpec"] = specs != null ? JsonHelper.GetString(specs, "torque", null) : null,
                    ["weightSpec"] = specs != null ? JsonHelper.GetString(specs, "weight", null) : null,
                    ["backupCount"] = CountBackups(carDir),
                });
            }

            cars.Sort((a, b) => string.Compare(Convert.ToString(a["name"]), Convert.ToString(b["name"]), StringComparison.CurrentCultureIgnoreCase));
            return cars;
        }

        private static Dictionary<string, string> ReadDataFolderFiles(string dataDir)
        {
            var res = new Dictionary<string, string>(StringComparer.Ordinal);
            if (!Directory.Exists(dataDir)) return res;
            foreach (string f in Directory.GetFiles(dataDir))
            {
                try { res[Path.GetFileName(f)] = File.ReadAllText(f, Encoding.UTF8); } catch { }
            }
            return res;
        }

        public static Dictionary<string, object> LoadCar(string carsDir, string carId)
        {
            string carDir = Path.Combine(carsDir, Path.GetFileName(carId));
            if (!Directory.Exists(carDir)) throw new DirectoryNotFoundException("車両フォルダが見つかりません: " + carDir);

            string dataDir = Path.Combine(carDir, "data");
            string acdPath = Path.Combine(carDir, "data.acd");
            string uiJsonPath = Path.Combine(carDir, "ui", "ui_car.json");

            bool hasDataFolder = Directory.Exists(dataDir);
            bool hasDataAcd = File.Exists(acdPath);

            var files = new Dictionary<string, string>(StringComparer.Ordinal);
            bool loadedFromAcd = false;

            if (hasDataFolder)
            {
                files = ReadDataFolderFiles(dataDir);
            }
            else if (hasDataAcd)
            {
                var unpacked = AcdCodec.UnpackAcdBuffer(File.ReadAllBytes(acdPath), carId);
                foreach (var kv in unpacked.Files)
                {
                    files[kv.Key] = Encoding.UTF8.GetString(kv.Value);
                }
                loadedFromAcd = true;
            }

            string uiRaw = File.Exists(uiJsonPath) ? File.ReadAllText(uiJsonPath, Encoding.UTF8) : "";
            var ui = File.Exists(uiJsonPath) ? JsonHelper.ParseAcJson(uiRaw) : new Dictionary<string, object>();
            var specs = JsonHelper.GetDict(ui, "specs");
            string badge = ReadBadgeImage(carDir);

            var summary = new Dictionary<string, object>
            {
                ["id"] = carId,
                ["name"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(ui, "name")) ? carId : JsonHelper.GetString(ui, "name").Trim(),
                ["brand"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(ui, "brand")) ? "Unknown" : JsonHelper.GetString(ui, "brand").Trim(),
                ["carClass"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(ui, "class")) ? "street" : JsonHelper.GetString(ui, "class").Trim(),
                ["year"] = JsonHelper.GetString(ui, "year", ""),
                ["country"] = JsonHelper.GetString(ui, "country", "").Trim(),
                ["hasDataFolder"] = hasDataFolder,
                ["hasDataAcd"] = hasDataAcd,
                ["dataSource"] = hasDataFolder ? "folder" : hasDataAcd ? "acd" : "none",
                ["previewDataUrl"] = ReadPreviewImage(carDir, badge),
                ["badgeDataUrl"] = badge,
                ["bhpSpec"] = specs != null ? JsonHelper.GetString(specs, "bhp", null) : null,
                ["torqueSpec"] = specs != null ? JsonHelper.GetString(specs, "torque", null) : null,
                ["weightSpec"] = specs != null ? JsonHelper.GetString(specs, "weight", null) : null,
                ["backupCount"] = CountBackups(carDir),
            };

            return new Dictionary<string, object>
            {
                ["summary"] = summary,
                ["carDir"] = carDir,
                ["files"] = files,
                ["uiCarJson"] = ui,
                ["uiCarJsonRaw"] = uiRaw,
                ["loadedFromAcd"] = loadedFromAcd,
            };
        }

        public static Dictionary<string, object> CreateBackup(string carsDir, string carId, string note)
        {
            try
            {
                string carDir = Path.Combine(carsDir, Path.GetFileName(carId));
                string backupsRoot = Path.Combine(carDir, BackupDirName);
                Directory.CreateDirectory(backupsRoot);

                DateTime now = DateTime.UtcNow;
                string id = now.ToString("yyyyMMdd_HHmmss");
                string targetDir = Path.Combine(backupsRoot, id);
                Directory.CreateDirectory(targetDir);

                string dataDir = Path.Combine(carDir, "data");
                string acdPath = Path.Combine(carDir, "data.acd");
                string uiJsonPath = Path.Combine(carDir, "ui", "ui_car.json");

                bool hasDataFolder = false;
                bool hasDataAcd = false;
                int fileCount = 0;

                if (Directory.Exists(dataDir))
                {
                    hasDataFolder = true;
                    string dstData = Path.Combine(targetDir, "data");
                    Directory.CreateDirectory(dstData);
                    foreach (string f in Directory.GetFiles(dataDir))
                    {
                        File.Copy(f, Path.Combine(dstData, Path.GetFileName(f)), true);
                        fileCount++;
                    }
                }

                if (File.Exists(acdPath))
                {
                    hasDataAcd = true;
                    File.Copy(acdPath, Path.Combine(targetDir, "data.acd"), true);
                    if (!hasDataFolder)
                    {
                        try { fileCount = AcdCodec.UnpackAcdBuffer(File.ReadAllBytes(acdPath), carId).Files.Count; }
                        catch { fileCount = 1; }
                    }
                }

                if (File.Exists(uiJsonPath))
                {
                    File.Copy(uiJsonPath, Path.Combine(targetDir, "ui_car.json"), true);
                }

                var entry = new Dictionary<string, object>
                {
                    ["id"] = id,
                    ["timestamp"] = now.ToString("o"),
                    ["note"] = string.IsNullOrWhiteSpace(note) ? "手動バックアップ" : note.Trim(),
                    ["hasDataFolder"] = hasDataFolder,
                    ["hasDataAcd"] = hasDataAcd,
                    ["fileCount"] = fileCount,
                };
                File.WriteAllText(Path.Combine(targetDir, "meta.json"), JsonHelper.Serialize(entry), Encoding.UTF8);
                return new Dictionary<string, object> { ["ok"] = true, ["entry"] = entry };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["error"] = ex.Message };
            }
        }

        public static List<Dictionary<string, object>> ListBackups(string carsDir, string carId)
        {
            string root = Path.Combine(carsDir, Path.GetFileName(carId), BackupDirName);
            var list = new List<Dictionary<string, object>>();
            if (!Directory.Exists(root)) return list;

            foreach (string d in Directory.GetDirectories(root))
            {
                string id = Path.GetFileName(d);
                if (id == "kn5_backups") continue;
                string metaPath = Path.Combine(d, "meta.json");
                if (File.Exists(metaPath))
                {
                    try
                    {
                        list.Add(JsonHelper.DeserializeDict(File.ReadAllText(metaPath, Encoding.UTF8)));
                        continue;
                    }
                    catch { }
                }
                list.Add(new Dictionary<string, object>
                {
                    ["id"] = id,
                    ["timestamp"] = id,
                    ["note"] = "バックアップ",
                    ["hasDataFolder"] = Directory.Exists(Path.Combine(d, "data")),
                    ["hasDataAcd"] = File.Exists(Path.Combine(d, "data.acd")),
                    ["fileCount"] = 0,
                });
            }

            list.Sort((a, b) => string.Compare(Convert.ToString(b["id"]), Convert.ToString(a["id"]), StringComparison.Ordinal));
            return list;
        }

        public static Dictionary<string, object> RestoreBackup(string carsDir, string carId, string backupId)
        {
            try
            {
                string carDir = Path.Combine(carsDir, Path.GetFileName(carId));
                string srcDir = Path.Combine(carDir, BackupDirName, Path.GetFileName(backupId));
                if (!Directory.Exists(srcDir))
                    return new Dictionary<string, object> { ["ok"] = false, ["error"] = "指定されたバックアップが見つかりません。" };

                string srcData = Path.Combine(srcDir, "data");
                string dstData = Path.Combine(carDir, "data");
                if (Directory.Exists(srcData))
                {
                    if (Directory.Exists(dstData)) Directory.Delete(dstData, true);
                    Directory.CreateDirectory(dstData);
                    foreach (string f in Directory.GetFiles(srcData))
                        File.Copy(f, Path.Combine(dstData, Path.GetFileName(f)), true);
                }

                string srcAcd = Path.Combine(srcDir, "data.acd");
                if (File.Exists(srcAcd)) File.Copy(srcAcd, Path.Combine(carDir, "data.acd"), true);

                string srcUi = Path.Combine(srcDir, "ui_car.json");
                if (File.Exists(srcUi))
                {
                    Directory.CreateDirectory(Path.Combine(carDir, "ui"));
                    File.Copy(srcUi, Path.Combine(carDir, "ui", "ui_car.json"), true);
                }
                return new Dictionary<string, object> { ["ok"] = true };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["error"] = ex.Message };
            }
        }

        public static Dictionary<string, object> DeleteBackup(string carsDir, string carId, string backupId)
        {
            try
            {
                string target = Path.Combine(carsDir, Path.GetFileName(carId), BackupDirName, Path.GetFileName(backupId));
                if (Directory.Exists(target)) Directory.Delete(target, true);
                return new Dictionary<string, object> { ["ok"] = true };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["error"] = ex.Message };
            }
        }

        public static Dictionary<string, string> LoadBackupData(string carsDir, string carId, string backupId)
        {
            string srcDir = Path.Combine(carsDir, Path.GetFileName(carId), BackupDirName, Path.GetFileName(backupId));
            string srcData = Path.Combine(srcDir, "data");
            if (Directory.Exists(srcData)) return ReadDataFolderFiles(srcData);
            string srcAcd = Path.Combine(srcDir, "data.acd");
            if (File.Exists(srcAcd))
            {
                var unpacked = AcdCodec.UnpackAcdBuffer(File.ReadAllBytes(srcAcd), carId);
                return unpacked.Files.ToDictionary(kv => kv.Key, kv => Encoding.UTF8.GetString(kv.Value));
            }
            return new Dictionary<string, string>();
        }

        public static Dictionary<string, object> SaveCar(
            string carsDir,
            string carId,
            Dictionary<string, string> files,
            Dictionary<string, object> uiCarJson,
            bool repackAcd,
            bool createBackupFirst,
            string backupNote)
        {
            try
            {
                string carDir = Path.Combine(carsDir, Path.GetFileName(carId));
                if (!Directory.Exists(carDir))
                    return new Dictionary<string, object> { ["ok"] = false, ["savedFiles"] = 0, ["packedAcd"] = false, ["error"] = "車両フォルダが存在しません。" };

                if (createBackupFirst) CreateBackup(carsDir, carId, string.IsNullOrEmpty(backupNote) ? "保存前自動バックアップ" : backupNote);

                string dataDir = Path.Combine(carDir, "data");
                Directory.CreateDirectory(dataDir);

                int savedFiles = 0;
                var bufMap = new Dictionary<string, byte[]>(StringComparer.Ordinal);
                var writtenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var kv in files)
                {
                    string safeName = Path.GetFileName(kv.Key);
                    if (string.IsNullOrEmpty(safeName)) continue;
                    byte[] utf8 = Encoding.UTF8.GetBytes(kv.Value ?? "");
                    File.WriteAllBytes(Path.Combine(dataDir, safeName), utf8);
                    bufMap[safeName] = utf8;
                    writtenNames.Add(safeName);
                    savedFiles++;
                }

                string[] managedRemovable = {
                    "ers.ini", "kers_torque_power.lut", "kers_torque_coast.lut",
                    "ctrl_ers_0.ini", "ctrl_ers_1.ini", "ctrl_ers_2.ini", "script.lua"
                };
                foreach (string name in managedRemovable)
                {
                    if (writtenNames.Contains(name)) continue;
                    string diskPath = Path.Combine(dataDir, name);
                    if (!File.Exists(diskPath)) continue;
                    if (name == "script.lua")
                    {
                        try { if (!File.ReadAllText(diskPath, Encoding.UTF8).Contains("AC_CAR_STUDIO_")) continue; }
                        catch { continue; }
                    }
                    try { File.Delete(diskPath); } catch { }
                }

                Directory.CreateDirectory(Path.Combine(carDir, "ui"));
                File.WriteAllText(Path.Combine(carDir, "ui", "ui_car.json"), JsonHelper.Serialize(uiCarJson ?? new Dictionary<string, object>()), Encoding.UTF8);

                bool packedAcd = false;
                if (repackAcd)
                {
                    var packed = AcdCodec.PackAcdBuffer(bufMap, carId);
                    File.WriteAllBytes(Path.Combine(carDir, "data.acd"), packed.Buffer);
                    packedAcd = true;
                }

                return new Dictionary<string, object> { ["ok"] = true, ["savedFiles"] = savedFiles, ["packedAcd"] = packedAcd };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["savedFiles"] = 0, ["packedAcd"] = false, ["error"] = ex.Message };
            }
        }

        public static Dictionary<string, object> UnpackAcd(string carsDir, string carId)
        {
            try
            {
                string carDir = Path.Combine(carsDir, Path.GetFileName(carId));
                string acdPath = Path.Combine(carDir, "data.acd");
                if (!File.Exists(acdPath))
                    return new Dictionary<string, object> { ["ok"] = false, ["message"] = "data.acd が見つかりません。" };

                var unpacked = AcdCodec.UnpackAcdBuffer(File.ReadAllBytes(acdPath), carId);
                string dataDir = Path.Combine(carDir, "data");
                Directory.CreateDirectory(dataDir);
                foreach (var kv in unpacked.Files)
                    File.WriteAllBytes(Path.Combine(dataDir, Path.GetFileName(kv.Key)), kv.Value);

                return new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["fileCount"] = unpacked.Files.Count,
                    ["keyString"] = unpacked.KeyString,
                    ["message"] = $"data.acd を data/ フォルダに展開しました ({unpacked.Files.Count} ファイル)。",
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["message"] = ex.Message };
            }
        }

        public static Dictionary<string, object> PackAcd(string carsDir, string carId, bool backupOldAcd)
        {
            try
            {
                string carDir = Path.Combine(carsDir, Path.GetFileName(carId));
                string dataDir = Path.Combine(carDir, "data");
                if (!Directory.Exists(dataDir))
                    return new Dictionary<string, object> { ["ok"] = false, ["message"] = "data/ フォルダが見つかりません。先に展開または保存してください。" };

                string acdPath = Path.Combine(carDir, "data.acd");
                if (backupOldAcd && File.Exists(acdPath)) CreateBackup(carsDir, carId, "data.acd 再パック前バックアップ");

                var bufMap = new Dictionary<string, byte[]>(StringComparer.Ordinal);
                foreach (string f in Directory.GetFiles(dataDir))
                    bufMap[Path.GetFileName(f)] = File.ReadAllBytes(f);

                if (bufMap.Count == 0)
                    return new Dictionary<string, object> { ["ok"] = false, ["message"] = "data/ フォルダが空です。" };

                var packed = AcdCodec.PackAcdBuffer(bufMap, carId);
                File.WriteAllBytes(acdPath, packed.Buffer);
                return new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["fileCount"] = bufMap.Count,
                    ["keyString"] = packed.KeyString,
                    ["message"] = $"data/ ({bufMap.Count} ファイル) を data.acd に再パックしました。",
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["message"] = ex.Message };
            }
        }

        public static Dictionary<string, object> CreateCarFromFiles(
            string carsDir,
            string rawFolderName,
            Dictionary<string, string> files,
            Dictionary<string, object> uiCarJson,
            Dictionary<string, object> uiSkinJson)
        {
            try
            {
                string folderName = Regex.Replace((rawFolderName ?? "").Trim().ToLowerInvariant(), @"[^a-z0-9_-]", "_");
                if (string.IsNullOrEmpty(folderName))
                    return new Dictionary<string, object> { ["ok"] = false, ["error"] = "有効なフォルダ名（半角英数字・アンダースコア）を入力してください。" };

                string carDir = Path.Combine(carsDir, folderName);
                if (Directory.Exists(carDir))
                    return new Dictionary<string, object> { ["ok"] = false, ["error"] = $"フォルダ \"{folderName}\" は既に存在します。別の名前を指定してください。" };

                Directory.CreateDirectory(Path.Combine(carDir, "data"));
                Directory.CreateDirectory(Path.Combine(carDir, "ui"));
                Directory.CreateDirectory(Path.Combine(carDir, "skins", "00_default"));
                Directory.CreateDirectory(Path.Combine(carDir, "sfx"));

                foreach (var kv in files)
                    File.WriteAllText(Path.Combine(carDir, "data", Path.GetFileName(kv.Key)), kv.Value ?? "", Encoding.UTF8);

                File.WriteAllText(Path.Combine(carDir, "ui", "ui_car.json"), JsonHelper.Serialize(uiCarJson ?? new Dictionary<string, object>()), Encoding.UTF8);
                File.WriteAllText(Path.Combine(carDir, "skins", "00_default", "ui_skin.json"), JsonHelper.Serialize(uiSkinJson ?? new Dictionary<string, object>()), Encoding.UTF8);

                return new Dictionary<string, object> { ["ok"] = true, ["carId"] = folderName };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["error"] = ex.Message };
            }
        }

        public static object LoadCustomPresets()
        {
            try
            {
                string f = GetPresetsFile();
                if (!File.Exists(f)) return new object[0];
                return JsonHelper.DeserializeAny(File.ReadAllText(f, Encoding.UTF8)) ?? new object[0];
            }
            catch { return new object[0]; }
        }

        public static bool SaveCustomPresets(object presets)
        {
            try
            {
                string f = GetPresetsFile();
                Directory.CreateDirectory(Path.GetDirectoryName(f));
                File.WriteAllText(f, JsonHelper.Serialize(presets), Encoding.UTF8);
                return true;
            }
            catch { return false; }
        }

        // ===== 3D Models (.kn5) =====
        private static string GetPrimaryLodFile(string carDir, string carId)
        {
            string ParseLods(string txt)
            {
                var m = Regex.Match(txt ?? "", @"\[LOD_0\][\s\S]*?FILE\s*=\s*([^\r\n;]+)", RegexOptions.IgnoreCase);
                return m.Success ? m.Groups[1].Value.Trim() : "";
            }

            string lodsPath = Path.Combine(carDir, "data", "lods.ini");
            if (File.Exists(lodsPath))
            {
                try { string found = ParseLods(File.ReadAllText(lodsPath, Encoding.UTF8)); if (!string.IsNullOrEmpty(found)) return found; } catch { }
            }

            string acdPath = Path.Combine(carDir, "data.acd");
            if (File.Exists(acdPath))
            {
                try
                {
                    var unpacked = AcdCodec.UnpackAcdBuffer(File.ReadAllBytes(acdPath), carId);
                    if (unpacked.Files.TryGetValue("lods.ini", out byte[] b) || unpacked.Files.TryGetValue("LODS.INI", out b))
                    {
                        string found = ParseLods(Encoding.UTF8.GetString(b));
                        if (!string.IsNullOrEmpty(found)) return found;
                    }
                }
                catch { }
            }
            return "";
        }

        private static int GetKn5PriorityRank(string fileName, string primaryLower)
        {
            string lower = fileName.ToLowerInvariant();
            if (lower == "collider.kn5" || lower.Contains("collider")) return 99;
            if (!string.IsNullOrEmpty(primaryLower) && lower == primaryLower) return 0;
            if (Regex.IsMatch(lower, @"(?:_lod_[bcd]|lod_[bcd]|_lod[123]|lod[123]|driver|crew)", RegexOptions.IgnoreCase)) return 2;
            return 1;
        }

        public static List<Dictionary<string, object>> ListCarModels(string carsDir, string carId)
        {
            string carDir = Path.Combine(carsDir, Path.GetFileName(carId));
            var list = new List<Dictionary<string, object>>();
            if (!Directory.Exists(carDir)) return list;

            string primary = GetPrimaryLodFile(carDir, carId).ToLowerInvariant();
            var items = new List<(string fileName, long sizeBytes, bool isPrimary, int rank)>();

            foreach (string f in Directory.GetFiles(carDir, "*.kn5"))
            {
                string name = Path.GetFileName(f);
                var fi = new FileInfo(f);
                int rank = GetKn5PriorityRank(name, primary);
                items.Add((name, fi.Length, rank == 0, rank));
            }

            items.Sort((a, b) =>
            {
                if (a.rank != b.rank) return a.rank.CompareTo(b.rank);
                if (a.sizeBytes != b.sizeBytes) return b.sizeBytes.CompareTo(a.sizeBytes);
                return string.Compare(a.fileName, b.fileName, StringComparison.OrdinalIgnoreCase);
            });

            if (items.Count > 0 && !items.Any(i => i.isPrimary) && items[0].rank < 99)
            {
                var first = items[0];
                items[0] = (first.fileName, first.sizeBytes, true, first.rank);
            }

            foreach (var it in items)
            {
                list.Add(new Dictionary<string, object>
                {
                    ["fileName"] = it.fileName,
                    ["sizeBytes"] = it.sizeBytes,
                    ["isPrimaryLod"] = it.isPrimary,
                });
            }
            return list;
        }

        public static byte[] ReadCarModelBytes(string carsDir, string carId, string fileName)
        {
            string full = Path.Combine(carsDir, Path.GetFileName(carId), Path.GetFileName(fileName));
            return File.Exists(full) ? File.ReadAllBytes(full) : null;
        }

        public static Dictionary<string, object> SaveCarModelBytes(string carsDir, string carId, string fileName, byte[] bytes, bool updateLodsIni)
        {
            try
            {
                string carDir = Path.Combine(carsDir, Path.GetFileName(carId));
                if (!Directory.Exists(carDir))
                    return new Dictionary<string, object> { ["ok"] = false, ["message"] = "車両フォルダが見つかりません。" };

                string baseName = Path.GetFileName(fileName);
                string safeName = baseName.EndsWith(".kn5", StringComparison.OrdinalIgnoreCase) ? baseName : baseName + ".kn5";
                string targetPath = Path.Combine(carDir, safeName);

                if (File.Exists(targetPath))
                {
                    string bakDir = Path.Combine(carDir, BackupDirName, "kn5_backups");
                    Directory.CreateDirectory(bakDir);
                    File.Copy(targetPath, Path.Combine(bakDir, DateTime.UtcNow.ToString("yyyyMMdd_HHmmss") + "_" + safeName), true);
                }

                File.WriteAllBytes(targetPath, bytes);

                if (updateLodsIni)
                {
                    string lodsPath = Path.Combine(carDir, "data", "lods.ini");
                    if (File.Exists(lodsPath))
                    {
                        string lods = File.ReadAllText(lodsPath, Encoding.UTF8);
                        if (Regex.IsMatch(lods, @"(\[LOD_0\][\s\S]*?FILE\s*=\s*)([^\r\n;]+)", RegexOptions.IgnoreCase))
                            lods = Regex.Replace(lods, @"(\[LOD_0\][\s\S]*?FILE\s*=\s*)([^\r\n;]+)", "${1}" + safeName, RegexOptions.IgnoreCase);
                        else
                            lods += $"\n[LOD_0]\nFILE={safeName}\nIN=0\nOUT=2000\n";
                        File.WriteAllText(lodsPath, lods, Encoding.UTF8);
                    }
                }

                return new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["message"] = $"{safeName} を保存しました ({bytes.Length / 1024.0:0.1} KB)",
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["message"] = ex.Message };
            }
        }

        public static Dictionary<string, object> ReplaceModelFromCar(string carsDir, string targetCarId, string sourceCarId, string sourceFileName)
        {
            try
            {
                string srcPath = Path.Combine(carsDir, Path.GetFileName(sourceCarId), Path.GetFileName(sourceFileName));
                if (!File.Exists(srcPath))
                    return new Dictionary<string, object> { ["ok"] = false, ["message"] = "元モデルが見つかりません: " + srcPath };

                byte[] bytes = File.ReadAllBytes(srcPath);
                string targetDir = Path.Combine(carsDir, Path.GetFileName(targetCarId));
                string primaryTarget = GetPrimaryLodFile(targetDir, targetCarId);
                if (string.IsNullOrEmpty(primaryTarget)) primaryTarget = targetCarId + ".kn5";

                var res = SaveCarModelBytes(carsDir, targetCarId, primaryTarget, bytes, true);
                bool ok = JsonHelper.GetBool(res, "ok");
                return new Dictionary<string, object>
                {
                    ["ok"] = ok,
                    ["targetFileName"] = primaryTarget,
                    ["message"] = ok ? $"{sourceCarId}/{sourceFileName} を {primaryTarget} に差し替えました" : JsonHelper.GetString(res, "message"),
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["message"] = ex.Message };
            }
        }

        // ===== Parts Library =====
        public static List<Dictionary<string, object>> ListSavedParts()
        {
            try
            {
                string idx = GetPartsIndexFile();
                if (!File.Exists(idx)) return new List<Dictionary<string, object>>();
                var raw = JsonHelper.DeserializeAny(File.ReadAllText(idx, Encoding.UTF8)) as object[];
                if (raw == null) return new List<Dictionary<string, object>>();
                var list = raw.OfType<Dictionary<string, object>>().ToList();
                list.Sort((a, b) => string.Compare(JsonHelper.GetString(b, "createdAt"), JsonHelper.GetString(a, "createdAt"), StringComparison.Ordinal));
                return list;
            }
            catch { return new List<Dictionary<string, object>>(); }
        }

        public static Dictionary<string, object> SavePartToLibrary(Dictionary<string, object> meta, byte[] kn5Bytes)
        {
            try
            {
                string dir = GetPartsLibDir();
                string id = $"part_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{Guid.NewGuid().ToString("N").Substring(0, 5)}";
                File.WriteAllBytes(Path.Combine(dir, id + ".kn5"), kn5Bytes);

                string name = JsonHelper.GetString(meta, "name").Trim();
                string srcNode = JsonHelper.GetString(meta, "sourceNodeName");
                var entry = new Dictionary<string, object>
                {
                    ["id"] = id,
                    ["name"] = string.IsNullOrEmpty(name) ? (string.IsNullOrEmpty(srcNode) ? "Saved Part" : srcNode) : name,
                    ["category"] = JsonHelper.GetString(meta, "category", "other"),
                    ["sourceCarId"] = JsonHelper.GetString(meta, "sourceCarId"),
                    ["sourceNodeName"] = srcNode,
                    ["sourceSide"] = meta.ContainsKey("sourceSide") ? meta["sourceSide"] : null,
                    ["bboxSize"] = meta.ContainsKey("bboxSize") ? meta["bboxSize"] : new double[] { 0.5, 0.5, 0.5 },
                    ["sizeBytes"] = kn5Bytes.Length,
                    ["createdAt"] = DateTime.UtcNow.ToString("o"),
                    ["thumbnailDataUrl"] = meta.ContainsKey("thumbnailDataUrl") ? meta["thumbnailDataUrl"] : null,
                };

                var list = ListSavedParts();
                list.Insert(0, entry);
                File.WriteAllText(GetPartsIndexFile(), JsonHelper.Serialize(list), Encoding.UTF8);
                return new Dictionary<string, object> { ["ok"] = true, ["entry"] = entry };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["error"] = ex.Message };
            }
        }

        public static byte[] LoadSavedPartBytes(string partId)
        {
            string p = Path.Combine(GetPartsLibDir(), Path.GetFileName(partId) + ".kn5");
            return File.Exists(p) ? File.ReadAllBytes(p) : null;
        }

        public static Dictionary<string, object> UpdateSavedPartMeta(string partId, Dictionary<string, object> patch)
        {
            try
            {
                var list = ListSavedParts();
                var target = list.FirstOrDefault(p => JsonHelper.GetString(p, "id") == partId);
                if (target == null) return new Dictionary<string, object> { ["ok"] = false, ["error"] = "パーツが見つかりません。" };

                if (patch.ContainsKey("name") && !string.IsNullOrWhiteSpace(JsonHelper.GetString(patch, "name")))
                    target["name"] = JsonHelper.GetString(patch, "name").Trim();
                if (patch.ContainsKey("category") && !string.IsNullOrWhiteSpace(JsonHelper.GetString(patch, "category")))
                    target["category"] = JsonHelper.GetString(patch, "category");
                if (patch.ContainsKey("thumbnailDataUrl"))
                    target["thumbnailDataUrl"] = patch["thumbnailDataUrl"];

                File.WriteAllText(GetPartsIndexFile(), JsonHelper.Serialize(list), Encoding.UTF8);
                return new Dictionary<string, object> { ["ok"] = true, ["entry"] = target };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["error"] = ex.Message };
            }
        }

        public static Dictionary<string, object> DeleteSavedPart(string partId)
        {
            try
            {
                string safeId = Path.GetFileName(partId);
                string kn5Path = Path.Combine(GetPartsLibDir(), safeId + ".kn5");
                if (File.Exists(kn5Path)) File.Delete(kn5Path);

                var list = ListSavedParts().Where(p => JsonHelper.GetString(p, "id") != safeId).ToList();
                File.WriteAllText(GetPartsIndexFile(), JsonHelper.Serialize(list), Encoding.UTF8);
                return new Dictionary<string, object> { ["ok"] = true };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["error"] = ex.Message };
            }
        }

        // ===== Skins / Livery Studio =====
        public static List<Dictionary<string, object>> ListCarSkins(string carsDir, string carId)
        {
            var result = new List<Dictionary<string, object>>();
            string skinsDir = Path.Combine(carsDir, Path.GetFileName(carId), "skins");
            if (!Directory.Exists(skinsDir)) return result;

            foreach (string sDir in Directory.GetDirectories(skinsDir))
            {
                string id = Path.GetFileName(sDir);
                string uiPath = Path.Combine(sDir, "ui_skin.json");
                var ui = File.Exists(uiPath) ? JsonHelper.ParseAcJson(File.ReadAllText(uiPath, Encoding.UTF8)) : new Dictionary<string, object>();

                string previewDataUrl = null;
                string prevPath = Path.Combine(sDir, "preview.jpg");
                try
                {
                    var fi = new FileInfo(prevPath);
                    if (fi.Exists && fi.Length <= 1_500_000)
                        previewDataUrl = "data:image/jpeg;base64," + Convert.ToBase64String(File.ReadAllBytes(prevPath));
                }
                catch { }

                var files = Directory.GetFiles(sDir).Select(Path.GetFileName).ToList();
                result.Add(new Dictionary<string, object>
                {
                    ["id"] = id,
                    ["skinName"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(ui, "skinname")) ? id : JsonHelper.GetString(ui, "skinname"),
                    ["driverName"] = JsonHelper.GetString(ui, "drivername", ""),
                    ["team"] = JsonHelper.GetString(ui, "team", ""),
                    ["number"] = JsonHelper.GetString(ui, "number", ""),
                    ["previewDataUrl"] = previewDataUrl,
                    ["files"] = files,
                });
            }

            result.Sort((a, b) => string.Compare(JsonHelper.GetString(a, "id"), JsonHelper.GetString(b, "id"), StringComparison.OrdinalIgnoreCase));
            return result;
        }

        public static byte[] ReadCarSkinFile(string carsDir, string carId, string skinId, string fileName)
        {
            string full = Path.Combine(carsDir, Path.GetFileName(carId), "skins", Path.GetFileName(skinId), Path.GetFileName(fileName));
            return File.Exists(full) ? File.ReadAllBytes(full) : null;
        }

        public static Dictionary<string, object> SaveCarSkin(
            string carsDir,
            string carId,
            Dictionary<string, object> meta,
            Dictionary<string, byte[]> binaryParts)
        {
            try
            {
                string safeSkinId = Regex.Replace(JsonHelper.GetString(meta, "skinFolderId").Trim().ToLowerInvariant(), @"[^a-z0-9_-]", "_");
                if (string.IsNullOrEmpty(safeSkinId))
                    return new Dictionary<string, object> { ["ok"] = false, ["message"] = "有効なスキンフォルダID（半角英数字・_・-）を入力してください。" };

                string skinDir = Path.Combine(carsDir, Path.GetFileName(carId), "skins", safeSkinId);
                Directory.CreateDirectory(skinDir);

                string safeTexName = Path.GetFileName(JsonHelper.GetString(meta, "textureFileName", "skin_body.dds"));
                if (binaryParts.TryGetValue("__mainTexture", out byte[] mainTex))
                    File.WriteAllBytes(Path.Combine(skinDir, safeTexName), mainTex);

                string extCfg = JsonHelper.GetString(meta, "extConfigIni", "");
                if (!string.IsNullOrWhiteSpace(extCfg))
                    File.WriteAllText(Path.Combine(skinDir, "ext_config.ini"), extCfg, Encoding.UTF8);

                foreach (var kv in binaryParts)
                {
                    if (kv.Key.StartsWith("extra:", StringComparison.Ordinal))
                    {
                        string safeExtra = Path.GetFileName(kv.Key.Substring(6));
                        if (!string.IsNullOrEmpty(safeExtra)) File.WriteAllBytes(Path.Combine(skinDir, safeExtra), kv.Value);
                    }
                }

                string skinName = JsonHelper.GetString(meta, "skinName").Trim();
                var uiSkin = new Dictionary<string, object>
                {
                    ["skinname"] = string.IsNullOrEmpty(skinName) ? safeSkinId : skinName,
                    ["drivername"] = JsonHelper.GetString(meta, "driverName").Trim(),
                    ["country"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(meta, "country")) ? "Japan" : JsonHelper.GetString(meta, "country").Trim(),
                    ["team"] = JsonHelper.GetString(meta, "team").Trim(),
                    ["number"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(meta, "number")) ? "01" : JsonHelper.GetString(meta, "number").Trim(),
                };
                File.WriteAllText(Path.Combine(skinDir, "ui_skin.json"), JsonHelper.Serialize(uiSkin), Encoding.UTF8);

                if (binaryParts.TryGetValue("__previewJpeg", out byte[] prevBytes) && prevBytes.Length > 100)
                    File.WriteAllBytes(Path.Combine(skinDir, "preview.jpg"), prevBytes);

                if (binaryParts.TryGetValue("__liveryPng", out byte[] livBytes) && livBytes.Length > 100)
                    File.WriteAllBytes(Path.Combine(skinDir, "livery.png"), livBytes);

                return new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["skinId"] = safeSkinId,
                    ["message"] = $"スキン「{uiSkin["skinname"]}」を skins/{safeSkinId}/ に書き出しました ({safeTexName} + ext_config.ini + preview.jpg + livery.png)",
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["message"] = ex.Message };
            }
        }

        // ===== Engine Sound Export =====
        public static Dictionary<string, object> ExportEngineSoundPack(
            string carsDir,
            string carId,
            Dictionary<string, object> meta,
            Dictionary<string, byte[]> wavFiles)
        {
            try
            {
                string carDir = Path.Combine(carsDir, Path.GetFileName(carId));
                if (!Directory.Exists(carDir))
                    return new Dictionary<string, object> { ["ok"] = false, ["writtenFiles"] = 0, ["message"] = "車両フォルダが見つかりません。" };

                string packDir = Path.Combine(carDir, "sfx", "engine_sim_export");
                string extDir = Path.Combine(carDir, "extension");
                string extSoundDir = Path.Combine(extDir, SoundWavSubdir);

                if (Directory.Exists(extSoundDir)) Directory.Delete(extSoundDir, true);
                Directory.CreateDirectory(extSoundDir);
                Directory.CreateDirectory(packDir);

                int written = 0;
                var samplesMeta = JsonHelper.GetList(meta, "samplesMeta");
                var intFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var obj in samplesMeta)
                {
                    var sm = obj as Dictionary<string, object>;
                    if (sm != null && JsonHelper.GetString(sm, "perspective") == "int")
                        intFiles.Add(Path.GetFileName(JsonHelper.GetString(sm, "fileName")));
                }

                foreach (var kv in wavFiles)
                {
                    string safeName = Path.GetFileName(kv.Key);
                    File.WriteAllBytes(Path.Combine(extSoundDir, safeName), kv.Value);
                    written++;
                    if (!intFiles.Contains(safeName)) File.WriteAllBytes(Path.Combine(packDir, safeName), kv.Value);
                }

                string luaScript = JsonHelper.GetString(meta, "cspLuaScript", "");
                if (!string.IsNullOrWhiteSpace(luaScript))
                {
                    File.WriteAllText(Path.Combine(extDir, SoundLuaFileName), luaScript, Encoding.UTF8);
                    written++;
                }

                File.WriteAllText(Path.Combine(packDir, "sound_manifest.json"), JsonHelper.GetString(meta, "manifestJson", "{}"), Encoding.UTF8);
                written++;

                string soundsPatch = JsonHelper.GetString(meta, "soundsIniPatch", "");
                if (!string.IsNullOrEmpty(soundsPatch))
                    File.WriteAllText(Path.Combine(packDir, "sounds_reference.ini"), soundsPatch, Encoding.UTF8);

                string extConfigPath = Path.Combine(extDir, "ext_config.ini");
                string block = $"{SoundExtMarkerStart}\n{JsonHelper.GetString(meta, "extConfigIni", "").Trim()}\n{SoundExtMarkerEnd}\n";
                string existing = File.Exists(extConfigPath) ? File.ReadAllText(extConfigPath, Encoding.UTF8) : "";
                int sIdx = existing.IndexOf(SoundExtMarkerStart, StringComparison.Ordinal);
                int eIdx = existing.IndexOf(SoundExtMarkerEnd, StringComparison.Ordinal);
                if (sIdx >= 0 && eIdx > sIdx)
                {
                    string before = existing.Substring(0, sIdx).TrimEnd();
                    string after = existing.Substring(eIdx + SoundExtMarkerEnd.Length).TrimStart();
                    var parts = new List<string>();
                    if (!string.IsNullOrEmpty(before)) parts.Add(before);
                    parts.Add(block.TrimEnd());
                    if (!string.IsNullOrEmpty(after)) parts.Add(after);
                    existing = string.Join("\n\n", parts) + "\n";
                }
                else
                {
                    existing = !string.IsNullOrWhiteSpace(existing) ? existing.TrimEnd() + "\n\n" + block : block;
                }
                File.WriteAllText(extConfigPath, existing, Encoding.UTF8);
                written++;

                return new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["exportDir"] = extSoundDir,
                    ["writtenFiles"] = written,
                    ["message"] = $"ACへエンジン音を反映しました ({wavFiles.Count} WAV + CSP Lua音響ランタイム + ext_config.ini)。",
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["writtenFiles"] = 0, ["message"] = ex.Message };
            }
        }

        public static Dictionary<string, object> RemoveCustomEngineSound(string carsDir, string carId)
        {
            try
            {
                string carDir = Path.Combine(carsDir, Path.GetFileName(carId));
                if (!Directory.Exists(carDir))
                    return new Dictionary<string, object> { ["ok"] = false, ["message"] = "車両フォルダが見つかりません。" };

                string extDir = Path.Combine(carDir, "extension");
                string luaPath = Path.Combine(extDir, SoundLuaFileName);
                string wavDir = Path.Combine(extDir, SoundWavSubdir);
                string extConfigPath = Path.Combine(extDir, "ext_config.ini");

                if (File.Exists(luaPath)) File.Delete(luaPath);
                if (Directory.Exists(wavDir)) Directory.Delete(wavDir, true);
                if (File.Exists(extConfigPath))
                {
                    string raw = File.ReadAllText(extConfigPath, Encoding.UTF8);
                    int sIdx = raw.IndexOf(SoundExtMarkerStart, StringComparison.Ordinal);
                    int eIdx = raw.IndexOf(SoundExtMarkerEnd, StringComparison.Ordinal);
                    if (sIdx >= 0 && eIdx > sIdx)
                    {
                        string before = raw.Substring(0, sIdx).TrimEnd();
                        string after = raw.Substring(eIdx + SoundExtMarkerEnd.Length).TrimStart();
                        string cleaned = string.Join("\n\n", new[] { before, after }.Where(s => !string.IsNullOrEmpty(s)));
                        File.WriteAllText(extConfigPath, string.IsNullOrEmpty(cleaned) ? "" : cleaned + "\n", Encoding.UTF8);
                    }
                }
                return new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["message"] = "カスタムエンジン音スクリプトを解除し、車両本来の .bank サウンドへ戻しました。",
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["message"] = ex.Message };
            }
        }

        public static Dictionary<string, object> CopySoundBankFromCar(string carsDir, string targetCarId, string sourceCarId)
        {
            try
            {
                string srcSfx = Path.Combine(carsDir, Path.GetFileName(sourceCarId), "sfx");
                if (!Directory.Exists(srcSfx))
                    return new Dictionary<string, object> { ["ok"] = false, ["message"] = $"コピー元車両 ({sourceCarId}) に sfx フォルダがありません。" };

                string dstSfx = Path.Combine(carsDir, Path.GetFileName(targetCarId), "sfx");
                Directory.CreateDirectory(dstSfx);

                string bankFile = Directory.GetFiles(srcSfx, "*.bank").FirstOrDefault();
                if (string.IsNullOrEmpty(bankFile))
                    return new Dictionary<string, object> { ["ok"] = false, ["message"] = $"コピー元車両 ({sourceCarId}) に .bank ファイルが見つかりません。" };

                File.Copy(bankFile, Path.Combine(dstSfx, targetCarId + ".bank"), true);

                string guidsFile = Directory.GetFiles(srcSfx).FirstOrDefault(f => Path.GetFileName(f).Equals("GUIDs.txt", StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrEmpty(guidsFile))
                {
                    string srcBase = Path.GetFileNameWithoutExtension(bankFile);
                    string guids = File.ReadAllText(guidsFile, Encoding.UTF8).Replace(srcBase, targetCarId);
                    File.WriteAllText(Path.Combine(dstSfx, "GUIDs.txt"), guids, Encoding.UTF8);
                }

                return new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["message"] = $"{sourceCarId} のベース .bank & GUIDs.txt を {targetCarId}.bank として移植しました。",
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["message"] = ex.Message };
            }
        }
    }
}
