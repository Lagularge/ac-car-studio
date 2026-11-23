using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AcCarStudioHost
{
    public sealed class MainForm : Form
    {
        private const string VirtualHost = "app.accarstudio.local";
        private const string VirtualOrigin = "https://app.accarstudio.local";
        private const int WM_APPCOMMAND = 0x0319;
        private const int APPCOMMAND_BROWSER_BACKWARD = 1;
        private const int APPCOMMAND_BROWSER_FORWARD = 2;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        private readonly WebView2 _webView;
        private readonly Dictionary<string, byte[]> _embeddedDistFiles;
        private readonly List<Form> _childWindows = new List<Form>();
        private readonly bool _smokeTestMode;
        private NativeBridge _bridge;

        public int ExitCode { get; private set; }

        public MainForm(bool smokeTestMode = false)
        {
            _smokeTestMode = smokeTestMode;
            Text = "AC Car Studio — Assetto Corsa Vehicle Creator & Tuner";
            Size = new Size(1480, 920);
            MinimumSize = new Size(720, 480);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(11, 14, 20);
            if (_smokeTestMode)
            {
                ShowInTaskbar = false;
                Opacity = 0.01;
            }

            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            EnableDarkTitleBar(this);

            _embeddedDistFiles = LoadEmbeddedDistZip();

            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.FromArgb(11, 14, 20),
            };
            Controls.Add(_webView);

            Shown += async (s, e) => await InitializeWebViewAsync();
            FormClosing += OnMainFormClosing;
        }

        internal static void EnableDarkTitleBar(Form form)
        {
            try
            {
                int dark = 1;
                // DWMWA_USE_IMMERSIVE_DARK_MODE (20 on Win11 / Win10 2004+, 19 on earlier Win10)
                DwmSetWindowAttribute(form.Handle, 20, ref dark, sizeof(int));
                DwmSetWindowAttribute(form.Handle, 19, ref dark, sizeof(int));
            }
            catch { }
        }

        private static Dictionary<string, byte[]> LoadEmbeddedDistZip()
        {
            var map = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
            using (Stream res = Assembly.GetExecutingAssembly().GetManifestResourceStream("dist.zip"))
            {
                if (res == null) return map;
                using (var archive = new ZipArchive(res, ZipArchiveMode.Read))
                {
                    foreach (var entry in archive.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name)) continue;
                        string key = entry.FullName.Replace('\\', '/').TrimStart('/');
                        using (var es = entry.Open())
                        using (var ms = new MemoryStream())
                        {
                            es.CopyTo(ms);
                            map[key] = ms.ToArray();
                        }
                    }
                }
            }
            return map;
        }

        private async Task InitializeWebViewAsync()
        {
            try
            {
                string userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ac-car-studio",
                    "webview2_data"
                );
                Directory.CreateDirectory(userDataFolder);

                var envOptions = new CoreWebView2EnvironmentOptions
                {
                    AdditionalBrowserArguments = "--autoplay-policy=no-user-gesture-required --disable-background-timer-throttling",
                };

                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, envOptions);
                await _webView.EnsureCoreWebView2Async(env);

                var core = _webView.CoreWebView2;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = true;
                core.Settings.AreDevToolsEnabled = true;
                core.Settings.IsWebMessageEnabled = true;

                _bridge = new NativeBridge(
                    this,
                    EmitEventToRenderer,
                    () => { if (!IsDisposed) BeginInvoke(new Action(Close)); }
                );

                // Intercept virtual host assets (dist.zip) & high-speed binary RPC (/___bin)
                core.AddWebResourceRequestedFilter(VirtualOrigin + "/*", CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += OnWebResourceRequested;
                core.WebMessageReceived += OnWebMessageReceived;
                core.NewWindowRequested += OnNewWindowRequested;

                if (_smokeTestMode)
                {
                    await core.AddScriptToExecuteOnDocumentCreatedAsync(
                        "window.__smokeErrors=[]; window.addEventListener('error', e => window.__smokeErrors.push(e.message || String(e))); window.addEventListener('unhandledrejection', e => window.__smokeErrors.push(String(e.reason)));");
                    core.NavigationCompleted += async (s, ev) =>
                    {
                        await RunSmokeTestChecksAsync(core, ev.IsSuccess, ev.WebErrorStatus.ToString());
                    };
                }

                string devUrl = Environment.GetEnvironmentVariable("VITE_DEV_SERVER_URL");
                if (!string.IsNullOrWhiteSpace(devUrl))
                {
                    core.Navigate(devUrl);
                }
                else
                {
                    core.Navigate(VirtualOrigin + "/index.html");
                }
            }
            catch (WebView2RuntimeNotFoundException)
            {
                if (_smokeTestMode)
                {
                    Console.Error.WriteLine("SMOKE_TEST_FAIL: WebView2RuntimeNotFoundException");
                    ExitCode = 10;
                    Close();
                    return;
                }
                var res = MessageBox.Show(
                    this,
                    "Microsoft Edge WebView2 Runtime が見つかりません。\nMicrosoft 公式ランタイムをダウンロードしますか？",
                    "AC Car Studio",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning
                );
                if (res == DialogResult.Yes)
                {
                    Process.Start(new ProcessStartInfo("https://go.microsoft.com/fwlink/p/?LinkId=2124703") { UseShellExecute = true });
                }
                Close();
            }
            catch (Exception ex)
            {
                if (_smokeTestMode)
                {
                    Console.Error.WriteLine("SMOKE_TEST_FAIL: " + ex);
                    ExitCode = 11;
                    Close();
                    return;
                }
                MessageBox.Show(this, "WebView2 初期化エラー:\n" + ex.Message, "AC Car Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        private async Task RunSmokeTestChecksAsync(CoreWebView2 core, bool navSuccess, string webErr)
        {
            try
            {
                if (!navSuccess)
                {
                    Console.Error.WriteLine("SMOKE_TEST_FAIL: Navigation failed: " + webErr);
                    ExitCode = 20;
                    Close();
                    return;
                }

                // Wait for React root & initial async IPC calls to settle
                for (int i = 0; i < 30; i++)
                {
                    await Task.Delay(150);
                    string ready = await core.ExecuteScriptAsync("document.body && document.body.innerText.toUpperCase().includes('AC CAR STUDIO') && document.body.innerText.includes('シンプル')");
                    if (ready == "true") break;
                }

                string jsCheck = @"
                    (async () => {
                        const hasApi = typeof window.acApi === 'object' && typeof window.acApi.getAppVersion === 'function';
                        const ver = hasApi ? await window.acApi.getAppVersion() : '';
                        const acDir = hasApi ? await window.acApi.detectAcDir() : null;
                        const parts = hasApi ? await window.acApi.listSavedParts() : null;
                        const presets = hasApi ? await window.acApi.loadCustomPresets() : null;
                        const serverDir = hasApi ? await window.acApi.detectServerDir() : null;
                        const iconRes = await fetch('https://app.accarstudio.local/icon.png');
                        const bin404 = await fetch('https://app.accarstudio.local/__bin/loadSavedPartBytes?partId=__smoke_nonexistent__');
                        const text = document.body ? document.body.innerText : '';
                        const hasSimpleToggle = text.includes('シンプル') && text.includes('通常');
                        const hasTitle = text.toUpperCase().includes('AC CAR STUDIO');
                        const simpleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'シンプル');
                        let toggledSimple = false;
                        if (simpleBtn) {
                            simpleBtn.click();
                            await new Promise(r => setTimeout(r, 150));
                            toggledSimple = (document.body.innerText || '').includes('シンプルモード中') || (document.body.innerText || '').includes('シンプル');
                            const normalBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === '通常');
                            if (normalBtn) normalBtn.click();
                        }
                        const errs = window.__smokeErrors || [];
                        return JSON.stringify({
                            hasApi,
                            ver,
                            acDirOk: !!acDir && Array.isArray(acDir.candidates),
                            partsIsArray: Array.isArray(parts),
                            presetsIsArray: Array.isArray(presets),
                            serverDirOk: !!serverDir && Array.isArray(serverDir.candidates),
                            iconOk: iconRes.status === 200,
                            binEndpointOk: bin404.status === 404,
                            hasSimpleToggle,
                            toggledSimple,
                            hasTitle,
                            errs
                        });
                    })()
                ";
                await core.ExecuteScriptAsync($"window.__smokeResult = null; ({jsCheck}).then(r => window.__smokeResult = r).catch(e => window.__smokeResult = JSON.stringify({{ err: String(e) }}));");
                string raw = "null";
                for (int i = 0; i < 40; i++)
                {
                    await Task.Delay(100);
                    raw = await core.ExecuteScriptAsync("window.__smokeResult");
                    if (raw != "null" && !string.IsNullOrEmpty(raw)) break;
                }

                string json = JsonHelper.DeserializeDict("{\"v\":" + raw + "}")["v"] as string ?? raw;
                var obj = JsonHelper.DeserializeDict(json);
                bool ok = JsonHelper.GetBool(obj, "hasApi")
                    && JsonHelper.GetString(obj, "ver") == UpdateService.GetAppVersion()
                    && JsonHelper.GetBool(obj, "acDirOk")
                    && JsonHelper.GetBool(obj, "partsIsArray")
                    && JsonHelper.GetBool(obj, "presetsIsArray")
                    && JsonHelper.GetBool(obj, "serverDirOk")
                    && JsonHelper.GetBool(obj, "iconOk")
                    && JsonHelper.GetBool(obj, "binEndpointOk")
                    && JsonHelper.GetBool(obj, "hasSimpleToggle")
                    && JsonHelper.GetBool(obj, "toggledSimple")
                    && JsonHelper.GetBool(obj, "hasTitle")
                    && JsonHelper.GetList(obj, "errs").Count == 0;

                if (ok)
                {
                    Console.WriteLine("SMOKE_TEST_PASS: " + json);
                    ExitCode = 0;
                }
                else
                {
                    Console.Error.WriteLine("SMOKE_TEST_FAIL: " + json);
                    ExitCode = 21;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("SMOKE_TEST_FAIL: " + ex);
                ExitCode = 22;
            }
            finally
            {
                Close();
            }
        }

        private void OnWebResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            try
            {
                var uri = new Uri(e.Request.Uri);
                if (!uri.Host.Equals(VirtualHost, StringComparison.OrdinalIgnoreCase)) return;

                string path = uri.AbsolutePath.TrimStart('/');

                // CORS preflight for dev mode (localhost:5173 -> https://app.accarstudio.local/__bin)
                if (e.Request.Method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    e.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                        new MemoryStream(),
                        204,
                        "No Content",
                        "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\n"
                    );
                    return;
                }

                // Binary RPC endpoint
                if (path.StartsWith("__bin/", StringComparison.OrdinalIgnoreCase))
                {
                    string action = path.Substring("__bin/".Length);
                    var query = ParseQueryString(uri.Query);
                    byte[] bodyBytes = null;
                    if (e.Request.Content != null)
                    {
                        using (var ms = new MemoryStream())
                        {
                            e.Request.Content.CopyTo(ms);
                            bodyBytes = ms.ToArray();
                        }
                    }

                    var (statusCode, contentType, respBody) = _bridge.HandleBinaryRequest(action, query, bodyBytes);
                    string reason = statusCode == 200 ? "OK" : statusCode == 404 ? "Not Found" : "Error";
                    string headers =
                        $"Content-Type: {contentType}\r\n" +
                        "Cache-Control: no-store\r\n" +
                        "Access-Control-Allow-Origin: *\r\n";

                    e.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                        new MemoryStream(respBody ?? new byte[0]),
                        statusCode,
                        reason,
                        headers
                    );
                    return;
                }

                // Serve embedded Vite dist/ files straight from RAM!
                if (string.IsNullOrEmpty(path)) path = "index.html";
                if (!_embeddedDistFiles.TryGetValue(path, out byte[] fileBytes))
                {
                    // Fallback to local dist/ folder if running unpacked without embedded dist.zip
                    string localDist = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dist", path.Replace('/', Path.DirectorySeparatorChar));
                    if (File.Exists(localDist)) fileBytes = File.ReadAllBytes(localDist);
                }

                if (fileBytes != null)
                {
                    string mime = GetMimeType(path);
                    e.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                        new MemoryStream(fileBytes),
                        200,
                        "OK",
                        $"Content-Type: {mime}\r\nCache-Control: no-cache\r\n"
                    );
                }
                else
                {
                    e.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                        new MemoryStream(Encoding.UTF8.GetBytes("Not Found")),
                        404,
                        "Not Found",
                        "Content-Type: text/plain\r\n"
                    );
                }
            }
            catch (Exception ex)
            {
                e.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                    new MemoryStream(Encoding.UTF8.GetBytes(ex.Message)),
                    500,
                    "Error",
                    "Content-Type: text/plain\r\nAccess-Control-Allow-Origin: *\r\n"
                );
            }
        }

        private async void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string id = "";
            try
            {
                var req = JsonHelper.DeserializeDict(e.WebMessageAsJson);
                if (JsonHelper.GetString(req, "type") != "rpc") return;
                id = JsonHelper.GetString(req, "id");
                string method = JsonHelper.GetString(req, "method");
                var args = JsonHelper.GetDict(req, "args") ?? new Dictionary<string, object>();

                object result = await _bridge.DispatchRpcAsync(method, args);
                PostJson(new Dictionary<string, object>
                {
                    ["type"] = "rpc_result",
                    ["id"] = id,
                    ["ok"] = true,
                    ["result"] = result,
                });
            }
            catch (Exception ex)
            {
                if (!string.IsNullOrEmpty(id))
                {
                    PostJson(new Dictionary<string, object>
                    {
                        ["type"] = "rpc_result",
                        ["id"] = id,
                        ["ok"] = false,
                        ["error"] = ex.Message,
                    });
                }
            }
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            // External links -> open in OS browser
            if (!string.IsNullOrEmpty(e.Uri) &&
                e.Uri.StartsWith("https://", StringComparison.OrdinalIgnoreCase) &&
                !e.Uri.StartsWith(VirtualOrigin, StringComparison.OrdinalIgnoreCase))
            {
                e.Handled = true;
                Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true });
                return;
            }

            // Internal window.open() for DetachablePanel floating / pop-out separate windows!
            var deferral = e.GetDeferral();
            var childForm = new Form
            {
                Text = "AC Car Studio — フローティング編集ウィンドウ",
                Size = new Size(
                    e.WindowFeatures.HasSize ? (int)Math.Max(420, e.WindowFeatures.Width) : 640,
                    e.WindowFeatures.HasSize ? (int)Math.Max(400, e.WindowFeatures.Height) : 760),
                MinimumSize = new Size(360, 360),
                StartPosition = FormStartPosition.CenterScreen,
                BackColor = Color.FromArgb(11, 14, 20),
            };
            try { childForm.Icon = Icon; } catch { }
            EnableDarkTitleBar(childForm);

            var childWeb = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.FromArgb(11, 14, 20),
            };
            childForm.Controls.Add(childWeb);
            _childWindows.Add(childForm);
            childForm.FormClosed += (s, ev) => _childWindows.Remove(childForm);

            childForm.Shown += async (s, ev) =>
            {
                try
                {
                    await childWeb.EnsureCoreWebView2Async(_webView.CoreWebView2.Environment);
                    e.NewWindow = childWeb.CoreWebView2;
                    e.Handled = true;
                }
                catch { }
                finally
                {
                    deferral.Complete();
                }
            };
            childForm.Show(this);
        }

        private void EmitEventToRenderer(string channel, object payload)
        {
            PostJson(new Dictionary<string, object>
            {
                ["type"] = "event",
                ["channel"] = channel,
                ["payload"] = payload,
            });
        }

        private void PostJson(object obj)
        {
            if (IsDisposed || _webView?.CoreWebView2 == null) return;
            string json = JsonHelper.Serialize(obj);
            if (InvokeRequired)
            {
                BeginInvoke(new Action(() =>
                {
                    if (!IsDisposed && _webView?.CoreWebView2 != null)
                        _webView.CoreWebView2.PostWebMessageAsJson(json);
                }));
            }
            else
            {
                _webView.CoreWebView2.PostWebMessageAsJson(json);
            }
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_APPCOMMAND)
            {
                int cmd = ((int)((long)m.LParam >> 16)) & 0x0FFF;
                if (cmd == APPCOMMAND_BROWSER_BACKWARD)
                {
                    EmitEventToRenderer("ac:appNavCommand", "back");
                    m.Result = (IntPtr)1;
                    return;
                }
                if (cmd == APPCOMMAND_BROWSER_FORWARD)
                {
                    EmitEventToRenderer("ac:appNavCommand", "forward");
                    m.Result = (IntPtr)1;
                    return;
                }
            }
            base.WndProc(ref m);
        }

        private void OnMainFormClosing(object sender, FormClosingEventArgs e)
        {
            ServerManager.StopServer();
            foreach (var w in _childWindows.ToArray())
            {
                try { if (!w.IsDisposed) w.Close(); } catch { }
            }
        }

        private static Dictionary<string, string> ParseQueryString(string query)
        {
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrEmpty(query)) return dict;
            foreach (string part in query.TrimStart('?').Split('&'))
            {
                if (string.IsNullOrEmpty(part)) continue;
                int eq = part.IndexOf('=');
                if (eq < 0) dict[Uri.UnescapeDataString(part)] = "";
                else dict[Uri.UnescapeDataString(part.Substring(0, eq))] = Uri.UnescapeDataString(part.Substring(eq + 1));
            }
            return dict;
        }

        private static string GetMimeType(string filePath)
        {
            switch (Path.GetExtension(filePath).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js":
                case ".mjs": return "application/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".webp": return "image/webp";
                case ".ico": return "image/x-icon";
                case ".woff2": return "font/woff2";
                case ".wasm": return "application/wasm";
                default: return "application/octet-stream";
            }
        }
    }
}
