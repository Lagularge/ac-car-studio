using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace AcCarStudioHost
{
    public static class ServerManager
    {
        private static Process _activeProcess;
        private static string _activeServerDir;
        private static string _activeStartedAt;

        private static string ResolveAcRootFromCarsDir(string carsDir)
        {
            if (string.IsNullOrEmpty(carsDir)) return null;
            string parent = Path.GetDirectoryName(carsDir.TrimEnd('\\', '/'));
            if (parent != null && Path.GetFileName(parent).Equals("content", StringComparison.OrdinalIgnoreCase))
            {
                return Path.GetDirectoryName(parent);
            }
            return null;
        }

        public static Dictionary<string, object> DetectServerDir(string carsDir)
        {
            var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            string root = ResolveAcRootFromCarsDir(carsDir);
            if (!string.IsNullOrEmpty(root)) candidates.Add(Path.Combine(root, "server"));

            foreach (string c in new[]
            {
                @"C:\Program Files (x86)\Steam\steamapps\common\assettocorsa\server",
                @"C:\Program Files\Steam\steamapps\common\assettocorsa\server",
                @"D:\SteamLibrary\steamapps\common\assettocorsa\server",
                @"D:\Steam\steamapps\common\assettocorsa\server",
                @"E:\SteamLibrary\steamapps\common\assettocorsa\server",
                @"F:\SteamLibrary\steamapps\common\assettocorsa\server",
                @"G:\SteamLibrary\steamapps\common\assettocorsa\server",
            }) candidates.Add(c);

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
                        candidates.Add(Path.Combine(lib, "steamapps", "common", "assettocorsa", "server"));
                    }
                }
                catch { }
            }

            var found = candidates.Where(Directory.Exists).ToList();
            string chosen = found.FirstOrDefault(d => File.Exists(Path.Combine(d, "acServer.exe"))) ?? found.FirstOrDefault();

            return new Dictionary<string, object>
            {
                ["serverDir"] = chosen,
                ["hasAcServerExe"] = !string.IsNullOrEmpty(chosen) && File.Exists(Path.Combine(chosen, "acServer.exe")),
                ["candidates"] = found,
            };
        }

        private static string ReadImageDataUrl(string dir, string[] names, int maxBytes = 2_500_000)
        {
            foreach (string name in names)
            {
                string full = Path.Combine(dir, name);
                try
                {
                    var fi = new FileInfo(full);
                    if (!fi.Exists || fi.Length > maxBytes) continue;
                    string ext = Path.GetExtension(name).ToLowerInvariant();
                    string mime = ext == ".png" ? "image/png" : ext == ".webp" ? "image/webp" : "image/jpeg";
                    return $"data:{mime};base64,{Convert.ToBase64String(File.ReadAllBytes(full))}";
                }
                catch { }
            }
            return null;
        }

        public static List<Dictionary<string, object>> ListInstalledTracks(string carsDir, string serverDir)
        {
            var trackDirs = new List<string>();
            string root = ResolveAcRootFromCarsDir(carsDir);
            if (!string.IsNullOrEmpty(root)) trackDirs.Add(Path.Combine(root, "content", "tracks"));
            if (!string.IsNullOrEmpty(serverDir))
            {
                string p = Path.GetDirectoryName(serverDir.TrimEnd('\\', '/'));
                if (!string.IsNullOrEmpty(p)) trackDirs.Add(Path.Combine(p, "content", "tracks"));
            }

            string tracksDir = trackDirs.FirstOrDefault(Directory.Exists);
            var tracks = new List<Dictionary<string, object>>();
            if (string.IsNullOrEmpty(tracksDir)) return tracks;

            foreach (string trackPath in Directory.GetDirectories(tracksDir))
            {
                string id = Path.GetFileName(trackPath);
                if (id.StartsWith(".")) continue;
                string uiDir = Path.Combine(trackPath, "ui");
                if (!Directory.Exists(uiDir)) continue;

                string rootPreview = ReadImageDataUrl(uiDir, new[] { "preview.png", "preview.jpg", "preview.jpeg" });
                string rootOutline = ReadImageDataUrl(uiDir, new[] { "outline.png", "outline.jpg" });
                var layouts = new List<Dictionary<string, object>>();

                string rootUiJson = Path.Combine(uiDir, "ui_track.json");
                if (File.Exists(rootUiJson))
                {
                    var meta = JsonHelper.ParseAcJson(File.ReadAllText(rootUiJson, Encoding.UTF8));
                    layouts.Add(new Dictionary<string, object>
                    {
                        ["id"] = "",
                        ["name"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(meta, "name")) ? id : JsonHelper.GetString(meta, "name"),
                        ["pitboxes"] = Math.Max(1, JsonHelper.GetInt(meta, "pitboxes", 18)),
                        ["length"] = JsonHelper.GetString(meta, "length", ""),
                        ["width"] = JsonHelper.GetString(meta, "width", null),
                        ["country"] = JsonHelper.GetString(meta, "country", ""),
                        ["city"] = JsonHelper.GetString(meta, "city", null),
                        ["previewDataUrl"] = rootPreview,
                        ["outlineDataUrl"] = rootOutline,
                    });
                }
                else
                {
                    foreach (string subDir in Directory.GetDirectories(uiDir))
                    {
                        string subJson = Path.Combine(subDir, "ui_track.json");
                        if (!File.Exists(subJson)) continue;
                        string subId = Path.GetFileName(subDir);
                        var meta = JsonHelper.ParseAcJson(File.ReadAllText(subJson, Encoding.UTF8));
                        layouts.Add(new Dictionary<string, object>
                        {
                            ["id"] = subId,
                            ["name"] = string.IsNullOrWhiteSpace(JsonHelper.GetString(meta, "name")) ? $"{id} ({subId})" : JsonHelper.GetString(meta, "name"),
                            ["pitboxes"] = Math.Max(1, JsonHelper.GetInt(meta, "pitboxes", 18)),
                            ["length"] = JsonHelper.GetString(meta, "length", ""),
                            ["width"] = JsonHelper.GetString(meta, "width", null),
                            ["country"] = JsonHelper.GetString(meta, "country", ""),
                            ["city"] = JsonHelper.GetString(meta, "city", null),
                            ["previewDataUrl"] = ReadImageDataUrl(subDir, new[] { "preview.png", "preview.jpg", "preview.jpeg" }) ?? rootPreview,
                            ["outlineDataUrl"] = ReadImageDataUrl(subDir, new[] { "outline.png", "outline.jpg" }) ?? rootOutline,
                        });
                    }
                }

                if (layouts.Count == 0) continue;
                layouts.Sort((a, b) => string.Compare(JsonHelper.GetString(a, "name"), JsonHelper.GetString(b, "name"), StringComparison.CurrentCultureIgnoreCase));
                var first = layouts[0];

                tracks.Add(new Dictionary<string, object>
                {
                    ["id"] = id,
                    ["name"] = layouts.Count == 1 ? JsonHelper.GetString(first, "name") : id,
                    ["country"] = JsonHelper.GetString(first, "country", ""),
                    ["city"] = JsonHelper.GetString(first, "city", ""),
                    ["previewDataUrl"] = first["previewDataUrl"] ?? rootPreview,
                    ["outlineDataUrl"] = first["outlineDataUrl"] ?? rootOutline,
                    ["layouts"] = layouts,
                });
            }

            tracks.Sort((a, b) => string.Compare(JsonHelper.GetString(a, "name"), JsonHelper.GetString(b, "name"), StringComparison.CurrentCultureIgnoreCase));
            return tracks;
        }

        public static Dictionary<string, object> ReadServerConfig(string serverDir)
        {
            string cfgDir = Path.Combine(serverDir, "cfg");
            string ReadOpt(string f)
            {
                string p = Path.Combine(cfgDir, f);
                return File.Exists(p) ? File.ReadAllText(p, Encoding.UTF8) : "";
            }
            return new Dictionary<string, object>
            {
                ["serverDir"] = serverDir,
                ["hasAcServerExe"] = File.Exists(Path.Combine(serverDir, "acServer.exe")),
                ["serverCfgIni"] = ReadOpt("server_cfg.ini"),
                ["entryListIni"] = ReadOpt("entry_list.ini"),
                ["cspExtraOptionsIni"] = ReadOpt("csp_extra_options.ini"),
            };
        }

        public static Dictionary<string, object> SaveServerConfig(string serverDir, Dictionary<string, object> payload)
        {
            try
            {
                string cfgDir = Path.Combine(serverDir, "cfg");
                Directory.CreateDirectory(cfgDir);
                var written = new List<string>();

                File.WriteAllText(Path.Combine(cfgDir, "server_cfg.ini"), JsonHelper.GetString(payload, "serverCfgIni"), new UTF8Encoding(false));
                written.Add("cfg/server_cfg.ini");

                File.WriteAllText(Path.Combine(cfgDir, "entry_list.ini"), JsonHelper.GetString(payload, "entryListIni"), new UTF8Encoding(false));
                written.Add("cfg/entry_list.ini");

                string cspPath = Path.Combine(cfgDir, "csp_extra_options.ini");
                if (JsonHelper.GetBool(payload, "writeCspExtra"))
                {
                    File.WriteAllText(cspPath, JsonHelper.GetString(payload, "cspExtraOptionsIni"), new UTF8Encoding(false));
                    written.Add("cfg/csp_extra_options.ini");
                }
                else if (File.Exists(cspPath))
                {
                    try { File.Delete(cspPath); } catch { }
                }

                return new Dictionary<string, object> { ["ok"] = true, ["writtenFiles"] = written };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["writtenFiles"] = new string[0], ["error"] = ex.Message };
            }
        }

        public static Dictionary<string, object> GetStatus()
        {
            bool running = false;
            int? pid = null;
            try
            {
                if (_activeProcess != null && !_activeProcess.HasExited)
                {
                    running = true;
                    pid = _activeProcess.Id;
                }
            }
            catch { running = false; }

            return new Dictionary<string, object>
            {
                ["running"] = running,
                ["pid"] = pid,
                ["serverDir"] = running ? _activeServerDir : null,
                ["startedAt"] = running ? _activeStartedAt : null,
            };
        }

        public static Dictionary<string, object> StartServer(
            string serverDir,
            Action<Dictionary<string, object>> onLog,
            Action<Dictionary<string, object>> onExit)
        {
            if (JsonHelper.GetBool(GetStatus(), "running"))
                return new Dictionary<string, object> { ["ok"] = false, ["error"] = "acServer.exe は既に起動中です。先に停止してください。" };

            string exePath = Path.Combine(serverDir, "acServer.exe");
            if (!File.Exists(exePath))
                return new Dictionary<string, object> { ["ok"] = false, ["error"] = "acServer.exe が見つかりません: " + exePath };

            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = exePath,
                    WorkingDirectory = serverDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };
                var proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
                proc.OutputDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                        onLog(new Dictionary<string, object> { ["stream"] = "stdout", ["line"] = e.Data, ["timestamp"] = DateTime.UtcNow.ToString("o") });
                };
                proc.ErrorDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                        onLog(new Dictionary<string, object> { ["stream"] = "stderr", ["line"] = e.Data, ["timestamp"] = DateTime.UtcNow.ToString("o") });
                };
                proc.Exited += (s, e) =>
                {
                    int code = 0;
                    try { code = proc.ExitCode; } catch { }
                    _activeProcess = null;
                    _activeServerDir = null;
                    _activeStartedAt = null;
                    onLog(new Dictionary<string, object> { ["stream"] = "system", ["line"] = $"acServer.exe が終了しました (code={code})", ["timestamp"] = DateTime.UtcNow.ToString("o") });
                    onExit(new Dictionary<string, object> { ["code"] = code, ["signal"] = null });
                };

                proc.Start();
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();

                _activeProcess = proc;
                _activeServerDir = serverDir;
                _activeStartedAt = DateTime.UtcNow.ToString("o");

                onLog(new Dictionary<string, object> { ["stream"] = "system", ["line"] = $"acServer.exe を起動しました (PID {proc.Id} / CWD: {serverDir})", ["timestamp"] = DateTime.UtcNow.ToString("o") });
                return new Dictionary<string, object> { ["ok"] = true, ["status"] = GetStatus() };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["error"] = ex.Message };
            }
        }

        public static Dictionary<string, object> StopServer()
        {
            if (_activeProcess == null)
                return new Dictionary<string, object> { ["ok"] = true, ["message"] = "サーバーは既に停止しています。" };

            try
            {
                if (!_activeProcess.HasExited) _activeProcess.Kill();
                _activeProcess = null;
                _activeServerDir = null;
                _activeStartedAt = null;
                return new Dictionary<string, object> { ["ok"] = true, ["message"] = "acServer.exe を停止しました。" };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object> { ["ok"] = false, ["message"] = "サーバー停止に失敗しました: " + ex.Message };
            }
        }
    }
}
