using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AcCarStudioHost
{
    public static class UpdateService
    {
        private const string LatestReleaseApi = "https://api.github.com/repos/Lagularge/ac-car-studio/releases/latest";
        private const string ReleasesPageUrl = "https://github.com/Lagularge/ac-car-studio/releases";

        public static string GetAppVersion()
        {
            var v = Assembly.GetExecutingAssembly().GetName().Version;
            return v != null ? $"{v.Major}.{v.Minor}.{v.Build}" : "1.1.0";
        }

        private static int CompareSemver(string latest, string current)
        {
            int[] Parse(string s)
            {
                string clean = (s ?? "0.0.0").Trim().TrimStart('v', 'V').Split('-')[0];
                var parts = clean.Split('.');
                int[] r = new int[3];
                for (int i = 0; i < 3 && i < parts.Length; i++) int.TryParse(parts[i], out r[i]);
                return r;
            }
            var a = Parse(latest);
            var b = Parse(current);
            for (int i = 0; i < 3; i++) if (a[i] != b[i]) return a[i] - b[i];
            return 0;
        }

        public static async Task<Dictionary<string, object>> CheckForUpdatesAsync()
        {
            string currentVersion = GetAppVersion();
            string checkedAt = DateTime.UtcNow.ToString("o");
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;

            try
            {
                var req = (HttpWebRequest)WebRequest.Create(LatestReleaseApi);
                req.UserAgent = $"AC-Car-Studio/{currentVersion}";
                req.Accept = "application/vnd.github+json";
                req.Timeout = 10000;

                string json;
                using (var resp = (HttpWebResponse)await req.GetResponseAsync())
                using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    json = await sr.ReadToEndAsync();

                var root = JsonHelper.DeserializeDict(json);
                string rawTag = JsonHelper.GetString(root, "tag_name").Trim();
                string latestVer = rawTag.TrimStart('v', 'V');

                var assets = JsonHelper.GetList(root, "assets").OfType<Dictionary<string, object>>().ToList();
                var exeAssets = assets.Where(a =>
                {
                    string n = JsonHelper.GetString(a, "name").ToLowerInvariant();
                    return n.EndsWith(".exe") && !n.Contains("online-setup") && !n.Contains("online_setup");
                }).ToList();

                var chosen = exeAssets.FirstOrDefault(a => JsonHelper.GetString(a, "name").IndexOf("portable", StringComparison.OrdinalIgnoreCase) >= 0)
                             ?? exeAssets.FirstOrDefault();

                bool updateAvailable = !string.IsNullOrEmpty(latestVer) && CompareSemver(latestVer, currentVersion) > 0;
                return new Dictionary<string, object>
                {
                    ["status"] = updateAvailable ? "update_available" : "up_to_date",
                    ["currentVersion"] = currentVersion,
                    ["latestVersion"] = string.IsNullOrEmpty(latestVer) ? null : latestVer,
                    ["releaseName"] = JsonHelper.GetString(root, "name", rawTag),
                    ["releaseNotes"] = JsonHelper.GetString(root, "body", "").Trim(),
                    ["publishedAt"] = JsonHelper.GetString(root, "published_at", null),
                    ["releaseUrl"] = JsonHelper.GetString(root, "html_url", ReleasesPageUrl),
                    ["downloadUrl"] = chosen != null ? JsonHelper.GetString(chosen, "browser_download_url", null) : null,
                    ["assetName"] = chosen != null ? JsonHelper.GetString(chosen, "name", null) : null,
                    ["assetSizeBytes"] = chosen != null ? Convert.ToInt64(chosen["size"]) : 0L,
                    ["installMode"] = chosen != null ? "portable_exe" : "browser_download",
                    ["checkedAt"] = checkedAt,
                };
            }
            catch (WebException wex) when ((wex.Response as HttpWebResponse)?.StatusCode == HttpStatusCode.NotFound)
            {
                return new Dictionary<string, object>
                {
                    ["status"] = "no_releases",
                    ["currentVersion"] = currentVersion,
                    ["latestVersion"] = null,
                    ["releaseName"] = null,
                    ["releaseNotes"] = "",
                    ["publishedAt"] = null,
                    ["releaseUrl"] = ReleasesPageUrl,
                    ["downloadUrl"] = null,
                    ["assetName"] = null,
                    ["assetSizeBytes"] = 0L,
                    ["installMode"] = "browser_download",
                    ["checkedAt"] = checkedAt,
                };
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object>
                {
                    ["status"] = "error",
                    ["currentVersion"] = currentVersion,
                    ["latestVersion"] = null,
                    ["releaseName"] = null,
                    ["releaseNotes"] = "",
                    ["publishedAt"] = null,
                    ["releaseUrl"] = ReleasesPageUrl,
                    ["downloadUrl"] = null,
                    ["assetName"] = null,
                    ["assetSizeBytes"] = 0L,
                    ["installMode"] = "browser_download",
                    ["checkedAt"] = checkedAt,
                    ["error"] = ex.Message,
                };
            }
        }

        public static async Task<Dictionary<string, object>> PerformUpdateAsync(
            Dictionary<string, object> info,
            Action<Dictionary<string, object>> onProgress,
            Action requestExit)
        {
            string downloadUrl = JsonHelper.GetString(info, "downloadUrl", "");
            string assetName = Path.GetFileName(JsonHelper.GetString(info, "assetName", ""));
            long expectedSize = info.ContainsKey("assetSizeBytes") && info["assetSizeBytes"] != null ? Convert.ToInt64(info["assetSizeBytes"]) : 0;

            if (string.IsNullOrEmpty(downloadUrl) || !downloadUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                string relUrl = JsonHelper.GetString(info, "releaseUrl", ReleasesPageUrl);
                Process.Start(new ProcessStartInfo(relUrl) { UseShellExecute = true });
                return new Dictionary<string, object> { ["ok"] = true, ["message"] = "ブラウザで GitHub リリースページを開きました。" };
            }

            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
                string currentExe = Application.ExecutablePath;
                string stagedPath = Path.Combine(Path.GetTempPath(), $"AC-Car-Studio-Update-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.exe");

                var req = (HttpWebRequest)WebRequest.Create(downloadUrl);
                req.UserAgent = $"AC-Car-Studio/{GetAppVersion()}";
                req.AllowAutoRedirect = true;

                using (var resp = await req.GetResponseAsync())
                using (var net = resp.GetResponseStream())
                using (var fs = new FileStream(stagedPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, true))
                {
                    long total = resp.ContentLength > 0 ? resp.ContentLength : expectedSize;
                    long downloaded = 0;
                    byte[] buf = new byte[65536];
                    var sw = Stopwatch.StartNew();
                    long lastEmit = 0;
                    int read;
                    while ((read = await net.ReadAsync(buf, 0, buf.Length)) > 0)
                    {
                        await fs.WriteAsync(buf, 0, read);
                        downloaded += read;
                        if (sw.ElapsedMilliseconds - lastEmit >= 120)
                        {
                            lastEmit = sw.ElapsedMilliseconds;
                            int pct = total > 0 ? (int)Math.Min(95L, (downloaded * 95L) / total) : 50;
                            onProgress(new Dictionary<string, object>
                            {
                                ["phase"] = "downloading",
                                ["percent"] = pct,
                                ["message"] = $"最新バージョンをダウンロード中... ({pct}%)",
                                ["downloadedBytes"] = downloaded,
                                ["totalBytes"] = total,
                            });
                        }
                    }
                }

                onProgress(new Dictionary<string, object> { ["phase"] = "verifying", ["percent"] = 97, ["message"] = "ダウンロードした実行ファイルを検証中..." });
                var fi = new FileInfo(stagedPath);
                byte[] magic = new byte[2];
                using (var fs = File.OpenRead(stagedPath)) fs.Read(magic, 0, 2);
                if (!fi.Exists || fi.Length < 500_000 || magic[0] != 0x4D || magic[1] != 0x5A)
                {
                    try { File.Delete(stagedPath); } catch { }
                    throw new InvalidDataException("ダウンロードした実行ファイルの検証に失敗しました。");
                }

                onProgress(new Dictionary<string, object> { ["phase"] = "applying", ["percent"] = 99, ["message"] = "最新版へ置き換えて再起動しています..." });

                string scriptPath = Path.Combine(Path.GetTempPath(), $"ac_car_studio_updater_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.cmd");
                string cmdBody = string.Join("\r\n", new[]
                {
                    "@echo off",
                    "chcp 65001 >nul",
                    "timeout /t 2 /nobreak >nul",
                    ":retry",
                    $"move /Y \"{stagedPath}\" \"{currentExe}\" >nul 2>&1",
                    "if errorlevel 1 (",
                    "  timeout /t 1 /nobreak >nul",
                    "  goto retry",
                    ")",
                    $"start \"\" \"{currentExe}\"",
                    "del \"%~f0\"",
                });
                File.WriteAllText(scriptPath, cmdBody, new UTF8Encoding(false));

                bool needsAdmin = currentExe.IndexOf("Program Files", StringComparison.OrdinalIgnoreCase) >= 0;
                var psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/c \"{scriptPath}\"",
                    UseShellExecute = needsAdmin,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = !needsAdmin,
                };
                if (needsAdmin) psi.Verb = "runas";
                Process.Start(psi);

                onProgress(new Dictionary<string, object> { ["phase"] = "done", ["percent"] = 100, ["message"] = "アップデート適用完了！再起動します..." });
                _ = Task.Delay(600).ContinueWith(_ => requestExit());

                return new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["restarting"] = true,
                    ["downloadedPath"] = currentExe,
                    ["message"] = "最新バージョンへ自動置換し、アプリを再起動します。",
                };
            }
            catch (Exception ex)
            {
                onProgress(new Dictionary<string, object> { ["phase"] = "error", ["percent"] = 0, ["message"] = ex.Message });
                return new Dictionary<string, object> { ["ok"] = false, ["message"] = "アップデートに失敗しました: " + ex.Message };
            }
        }
    }
}
