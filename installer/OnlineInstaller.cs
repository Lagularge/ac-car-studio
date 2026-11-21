using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("AC Car Studio Online Installer")]
[assembly: AssemblyDescription("GitHub Online Web Installer & Updater for AC Car Studio")]
[assembly: AssemblyCompany("Lagularge")]
[assembly: AssemblyProduct("AC Car Studio")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace AcCarStudioInstaller
{
    internal sealed class ReleaseAssetInfo
    {
        public string Name;
        public string DownloadUrl;
        public long Size;
        public string Sha256;
    }

    internal sealed class ReleaseMeta
    {
        public string TagName;
        public string Title;
        public string Notes;
        public string PublishedAt;
        public string HtmlUrl;
        public ReleaseAssetInfo Asset;
    }

    public sealed class InstallerForm : Form
    {
        private const string GitHubOwner = "Lagularge";
        private const string GitHubRepo = "ac-car-studio";
        private const string LatestReleaseApiUrl = "https://api.github.com/repos/Lagularge/ac-car-studio/releases/latest";
        private const string ReleasesPageUrl = "https://github.com/Lagularge/ac-car-studio/releases";
        private const string UninstallRegKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\ACCarStudio";

        private Label lblVersionBadge;
        private Label lblStatus;
        private Label lblProgressDetail;
        private TextBox txtReleaseNotes;
        private TextBox txtInstallDir;
        private Button btnBrowse;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private CheckBox chkLaunchAfter;
        private ProgressBar progressBar;
        private Button btnInstall;
        private Button btnUninstall;
        private Button btnGitHub;

        private ReleaseMeta latestRelease;
        private bool isBusy;
        private CancellationTokenSource cts;

        public InstallerForm()
        {
            InitializeUi();
            Shown += OnFormShown;
        }

        private void InitializeUi()
        {
            Text = "AC Car Studio — GitHub オンラインインストーラー";
            Size = new Size(640, 560);
            MinimumSize = new Size(620, 540);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            BackColor = Color.FromArgb(11, 14, 20);
            ForeColor = Color.FromArgb(241, 245, 249);
            Font = new Font("Yu Gothic UI", 9.5f, FontStyle.Regular);

            // Top Banner Panel
            Panel headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 82;
            headerPanel.BackColor = Color.FromArgb(16, 23, 36);

            Label lblTitle = new Label();
            lblTitle.Text = "AC CAR STUDIO";
            lblTitle.Font = new Font("Segoe UI", 16f, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(22, 14);
            lblTitle.AutoSize = true;
            headerPanel.Controls.Add(lblTitle);

            Label lblSub = new Label();
            lblSub.Text = "GitHub Online Web Installer • 常に最新のリリース版を自動取得してインストール";
            lblSub.Font = new Font("Yu Gothic UI", 9f, FontStyle.Regular);
            lblSub.ForeColor = Color.FromArgb(148, 163, 184);
            lblSub.Location = new Point(24, 46);
            lblSub.AutoSize = true;
            headerPanel.Controls.Add(lblSub);

            lblVersionBadge = new Label();
            lblVersionBadge.Text = "GitHub 確認中...";
            lblVersionBadge.Font = new Font("Consolas", 9.5f, FontStyle.Bold);
            lblVersionBadge.ForeColor = Color.FromArgb(52, 211, 153);
            lblVersionBadge.BackColor = Color.FromArgb(15, 41, 34);
            lblVersionBadge.AutoSize = true;
            lblVersionBadge.Padding = new Padding(8, 4, 8, 4);
            lblVersionBadge.Location = new Point(460, 20);
            headerPanel.Controls.Add(lblVersionBadge);

            Controls.Add(headerPanel);

            // Release Notes Group
            Label lblNotesTitle = new Label();
            lblNotesTitle.Text = "最新リリース情報 (GitHub Releases: Lagularge/ac-car-studio)";
            lblNotesTitle.Font = new Font("Yu Gothic UI", 9.5f, FontStyle.Bold);
            lblNotesTitle.ForeColor = Color.FromArgb(56, 189, 248);
            lblNotesTitle.Location = new Point(22, 96);
            lblNotesTitle.AutoSize = true;
            Controls.Add(lblNotesTitle);

            txtReleaseNotes = new TextBox();
            txtReleaseNotes.Multiline = true;
            txtReleaseNotes.ReadOnly = true;
            txtReleaseNotes.ScrollBars = ScrollBars.Vertical;
            txtReleaseNotes.BackColor = Color.FromArgb(17, 23, 34);
            txtReleaseNotes.ForeColor = Color.FromArgb(203, 213, 225);
            txtReleaseNotes.BorderStyle = BorderStyle.FixedSingle;
            txtReleaseNotes.Font = new Font("Yu Gothic UI", 9f);
            txtReleaseNotes.Location = new Point(22, 120);
            txtReleaseNotes.Size = new Size(580, 128);
            txtReleaseNotes.Text = "GitHub リポジトリ (Lagularge/ac-car-studio) から最新リリース情報を取得しています...";
            Controls.Add(txtReleaseNotes);

            // Install Location
            Label lblDirTitle = new Label();
            lblDirTitle.Text = "インストール先フォルダ:";
            lblDirTitle.Font = new Font("Yu Gothic UI", 9f, FontStyle.Bold);
            lblDirTitle.Location = new Point(22, 260);
            lblDirTitle.AutoSize = true;
            Controls.Add(lblDirTitle);

            string defaultDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "AC Car Studio"
            );

            txtInstallDir = new TextBox();
            txtInstallDir.Text = defaultDir;
            txtInstallDir.BackColor = Color.FromArgb(17, 23, 34);
            txtInstallDir.ForeColor = Color.White;
            txtInstallDir.BorderStyle = BorderStyle.FixedSingle;
            txtInstallDir.Location = new Point(22, 282);
            txtInstallDir.Size = new Size(486, 25);
            Controls.Add(txtInstallDir);

            btnBrowse = new Button();
            btnBrowse.Text = "参照...";
            btnBrowse.FlatStyle = FlatStyle.Flat;
            btnBrowse.BackColor = Color.FromArgb(26, 36, 54);
            btnBrowse.ForeColor = Color.FromArgb(226, 232, 240);
            btnBrowse.Location = new Point(516, 280);
            btnBrowse.Size = new Size(86, 27);
            btnBrowse.Click += OnBrowseClick;
            Controls.Add(btnBrowse);

            // Options Checkboxes
            chkDesktopShortcut = new CheckBox();
            chkDesktopShortcut.Text = "デスクトップにショートカットを作成";
            chkDesktopShortcut.Checked = true;
            chkDesktopShortcut.Location = new Point(24, 318);
            chkDesktopShortcut.AutoSize = true;
            Controls.Add(chkDesktopShortcut);

            chkStartMenuShortcut = new CheckBox();
            chkStartMenuShortcut.Text = "スタートメニューに登録";
            chkStartMenuShortcut.Checked = true;
            chkStartMenuShortcut.Location = new Point(290, 318);
            chkStartMenuShortcut.AutoSize = true;
            Controls.Add(chkStartMenuShortcut);

            chkLaunchAfter = new CheckBox();
            chkLaunchAfter.Text = "インストール完了後に AC Car Studio をすぐ起動する";
            chkLaunchAfter.Checked = true;
            chkLaunchAfter.Location = new Point(24, 344);
            chkLaunchAfter.AutoSize = true;
            Controls.Add(chkLaunchAfter);

            // Progress Section
            lblStatus = new Label();
            lblStatus.Text = "準備中...";
            lblStatus.Font = new Font("Yu Gothic UI", 9f, FontStyle.Bold);
            lblStatus.ForeColor = Color.FromArgb(16, 185, 129);
            lblStatus.Location = new Point(22, 378);
            lblStatus.Size = new Size(380, 20);
            Controls.Add(lblStatus);

            lblProgressDetail = new Label();
            lblProgressDetail.Text = "";
            lblProgressDetail.Font = new Font("Consolas", 8.5f, FontStyle.Regular);
            lblProgressDetail.ForeColor = Color.FromArgb(148, 163, 184);
            lblProgressDetail.TextAlign = ContentAlignment.MiddleRight;
            lblProgressDetail.Location = new Point(402, 378);
            lblProgressDetail.Size = new Size(200, 20);
            Controls.Add(lblProgressDetail);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(22, 402);
            progressBar.Size = new Size(580, 22);
            progressBar.Minimum = 0;
            progressBar.Maximum = 100;
            progressBar.Value = 0;
            Controls.Add(progressBar);

            // Footer Buttons
            btnGitHub = new Button();
            btnGitHub.Text = "GitHub を開く";
            btnGitHub.FlatStyle = FlatStyle.Flat;
            btnGitHub.BackColor = Color.FromArgb(22, 30, 46);
            btnGitHub.ForeColor = Color.FromArgb(148, 163, 184);
            btnGitHub.Location = new Point(22, 452);
            btnGitHub.Size = new Size(124, 38);
            btnGitHub.Click += delegate { Process.Start(ReleasesPageUrl); };
            Controls.Add(btnGitHub);

            btnUninstall = new Button();
            btnUninstall.Text = "アンインストール";
            btnUninstall.FlatStyle = FlatStyle.Flat;
            btnUninstall.BackColor = Color.FromArgb(45, 22, 32);
            btnUninstall.ForeColor = Color.FromArgb(253, 164, 175);
            btnUninstall.Location = new Point(156, 452);
            btnUninstall.Size = new Size(134, 38);
            btnUninstall.Click += OnUninstallClick;
            Controls.Add(btnUninstall);

            btnInstall = new Button();
            btnInstall.Text = "最新版をダウンロードしてインストール";
            btnInstall.Font = new Font("Yu Gothic UI", 10f, FontStyle.Bold);
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.BackColor = Color.FromArgb(5, 150, 105);
            btnInstall.ForeColor = Color.White;
            btnInstall.Location = new Point(322, 452);
            btnInstall.Size = new Size(280, 38);
            btnInstall.Enabled = false;
            btnInstall.Click += OnInstallClick;
            Controls.Add(btnInstall);
        }

        private async void OnFormShown(object sender, EventArgs e)
        {
            await RefreshLatestReleaseFromGitHubAsync();
        }

        private void OnBrowseClick(object sender, EventArgs e)
        {
            using (FolderBrowserDialog dlg = new FolderBrowserDialog())
            {
                dlg.Description = "AC Car Studio のインストール先フォルダを選択してください";
                dlg.SelectedPath = txtInstallDir.Text;
                if (dlg.ShowDialog(this) == DialogResult.OK)
                {
                    txtInstallDir.Text = dlg.SelectedPath;
                }
            }
        }

        private async Task RefreshLatestReleaseFromGitHubAsync()
        {
            lblStatus.Text = "GitHub から最新リリース情報を取得しています...";
            btnInstall.Enabled = false;

            try
            {
                ReleaseMeta meta = await Task.Run(new Func<ReleaseMeta>(FetchLatestReleaseSync));
                latestRelease = meta;

                double sizeMb = meta.Asset != null ? (meta.Asset.Size / (1024.0 * 1024.0)) : 0.0;
                lblVersionBadge.Text = String.Format("最新: {0} ({1:0.1} MB)", meta.TagName, sizeMb);
                txtReleaseNotes.Text = String.Format(
                    "[{0}]  公開日: {1}\r\n配布ファイル: {2} ({3:0.1} MB)\r\n\r\n{4}",
                    meta.Title,
                    meta.PublishedAt,
                    meta.Asset != null ? meta.Asset.Name : "なし",
                    sizeMb,
                    String.IsNullOrEmpty(meta.Notes) ? "リリースノートなし" : meta.Notes.Replace("\n", "\r\n")
                );

                if (meta.Asset != null && !String.IsNullOrEmpty(meta.Asset.DownloadUrl))
                {
                    string targetExe = Path.Combine(txtInstallDir.Text, "AC Car Studio.exe");
                    btnInstall.Text = File.Exists(targetExe)
                        ? String.Format("最新版 ({0}) へアップデート / 再インストール", meta.TagName)
                        : String.Format("最新版 ({0}) をインストール", meta.TagName);
                    btnInstall.Enabled = true;
                    lblStatus.Text = "準備完了 — 「インストール」を押すと GitHub から直接導入します。";
                }
                else
                {
                    lblStatus.Text = "リリース内に実行ファイル (.exe) が見つかりませんでした。";
                }
            }
            catch (Exception ex)
            {
                lblVersionBadge.Text = "接続エラー";
                lblStatus.Text = "GitHub API への接続に失敗しました。";
                txtReleaseNotes.Text = "エラー詳細:\r\n" + ex.Message + "\r\n\r\nインターネット接続を確認するか、「GitHub を開く」から手動でダウンロードしてください。";
            }
        }

        internal static ReleaseMeta FetchLatestReleaseSync()
        {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(LatestReleaseApiUrl);
            req.UserAgent = "AC-Car-Studio-Online-Installer/1.0";
            req.Accept = "application/vnd.github+json";
            req.Timeout = 15000;

            string json;
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                json = reader.ReadToEnd();
            }

            JavaScriptSerializer serializer = new JavaScriptSerializer();
            Dictionary<string, object> root = serializer.Deserialize<Dictionary<string, object>>(json);

            ReleaseMeta meta = new ReleaseMeta();
            meta.TagName = GetStr(root, "tag_name", "v1.0.0");
            meta.Title = GetStr(root, "name", meta.TagName);
            meta.Notes = GetStr(root, "body", "");
            meta.PublishedAt = GetStr(root, "published_at", "");
            meta.HtmlUrl = GetStr(root, "html_url", ReleasesPageUrl);

            if (root.ContainsKey("assets") && root["assets"] is ArrayList)
            {
                ArrayList assets = (ArrayList)root["assets"];
                ReleaseAssetInfo fallbackExe = null;

                foreach (object item in assets)
                {
                    Dictionary<string, object> a = item as Dictionary<string, object>;
                    if (a == null) continue;
                    string name = GetStr(a, "name", "");
                    string url = GetStr(a, "browser_download_url", "");
                    if (!name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) continue;
                    if (name.IndexOf("online-setup", StringComparison.OrdinalIgnoreCase) >= 0) continue;

                    long size = 0;
                    if (a.ContainsKey("size") && a["size"] != null)
                    {
                        size = Convert.ToInt64(a["size"]);
                    }
                    string digest = GetStr(a, "digest", "");
                    string sha256 = "";
                    if (digest.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase))
                    {
                        sha256 = digest.Substring(7).Trim();
                    }

                    ReleaseAssetInfo info = new ReleaseAssetInfo
                    {
                        Name = name,
                        DownloadUrl = url,
                        Size = size,
                        Sha256 = sha256
                    };

                    if (name.IndexOf("portable", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        meta.Asset = info;
                        break;
                    }
                    if (fallbackExe == null) fallbackExe = info;
                }

                if (meta.Asset == null) meta.Asset = fallbackExe;
            }

            return meta;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool DeleteFileW(string lpFileName);

        private static void RemoveZoneIdentifier(string filePath)
        {
            try
            {
                DeleteFileW(filePath + ":Zone.Identifier");
            }
            catch
            {
                // Ignore if ADS is not present
            }
        }

        private static string GetStr(Dictionary<string, object> dict, string key, string fallback)
        {
            if (dict != null && dict.ContainsKey(key) && dict[key] != null)
            {
                return Convert.ToString(dict[key]);
            }
            return fallback;
        }

        private async void OnInstallClick(object sender, EventArgs e)
        {
            if (isBusy || latestRelease == null || latestRelease.Asset == null) return;

            string installDir = txtInstallDir.Text.Trim();
            if (String.IsNullOrEmpty(installDir))
            {
                MessageBox.Show(this, "インストール先フォルダを指定してください。", "AC Car Studio", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            isBusy = true;
            btnInstall.Enabled = false;
            btnUninstall.Enabled = false;
            btnBrowse.Enabled = false;
            progressBar.Value = 0;
            cts = new CancellationTokenSource();

            string targetExePath = Path.Combine(installDir, "AC Car Studio.exe");
            string tempDownloadPath = Path.Combine(installDir, "AC-Car-Studio.download.tmp");

            try
            {
                Directory.CreateDirectory(installDir);

                lblStatus.Text = String.Format("GitHub から {0} をダウンロード中...", latestRelease.Asset.Name);
                await DownloadAssetAsync(latestRelease.Asset, tempDownloadPath, cts.Token);

                lblStatus.Text = "ファイルの整合性 (PE / SHA-256) を検証しています...";
                progressBar.Value = 98;
                await Task.Run(delegate
                {
                    VerifyDownloadedExe(tempDownloadPath, latestRelease.Asset.Sha256);
                });

                lblStatus.Text = "実行ファイルを配置し、ショートカットを作成しています...";
                if (File.Exists(targetExePath))
                {
                    File.Delete(targetExePath);
                }
                File.Move(tempDownloadPath, targetExePath);
                RemoveZoneIdentifier(targetExePath);

                // Write version marker & copy uninstaller helper
                File.WriteAllText(Path.Combine(installDir, "version.txt"), latestRelease.TagName, Encoding.UTF8);
                string selfExe = Application.ExecutablePath;
                string uninstallerExe = Path.Combine(installDir, "AC-Car-Studio-Online-Setup.exe");
                if (!String.Equals(Path.GetFullPath(selfExe), Path.GetFullPath(uninstallerExe), StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(selfExe, uninstallerExe, true);
                    RemoveZoneIdentifier(uninstallerExe);
                }

                if (chkDesktopShortcut.Checked)
                {
                    string desktopLnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "AC Car Studio.lnk");
                    CreateShortcut(desktopLnk, targetExePath, installDir, "Assetto Corsa Vehicle Creator & Physics Studio");
                }

                if (chkStartMenuShortcut.Checked)
                {
                    string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "AC Car Studio");
                    Directory.CreateDirectory(startMenuDir);
                    CreateShortcut(Path.Combine(startMenuDir, "AC Car Studio.lnk"), targetExePath, installDir, "Assetto Corsa Vehicle Creator & Physics Studio");
                    CreateShortcut(Path.Combine(startMenuDir, "AC Car Studio アップデート・アンインストール.lnk"), uninstallerExe, installDir, "AC Car Studio Updater & Uninstaller");
                }

                RegisterUninstallerInRegistry(installDir, targetExePath, uninstallerExe, latestRelease.TagName);

                progressBar.Value = 100;
                lblStatus.Text = String.Format("インストール完了！ ({0})", latestRelease.TagName);
                lblProgressDetail.Text = "100% 完了";

                if (chkLaunchAfter.Checked)
                {
                    Process.Start(new ProcessStartInfo(targetExePath) { WorkingDirectory = installDir });
                    Close();
                    return;
                }

                MessageBox.Show(
                    this,
                    String.Format("AC Car Studio ({0}) のインストールが完了しました！\r\n\r\nインストール先:\r\n{1}", latestRelease.TagName, targetExePath),
                    "インストール完了",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            catch (Exception ex)
            {
                try { if (File.Exists(tempDownloadPath)) File.Delete(tempDownloadPath); } catch { }
                lblStatus.Text = "インストール中にエラーが発生しました。";
                MessageBox.Show(
                    this,
                    "インストールに失敗しました:\r\n" + ex.Message + "\r\n\r\nAC Car Studio が起動中の場合は閉じてから再試行してください。",
                    "エラー",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            finally
            {
                isBusy = false;
                btnInstall.Enabled = true;
                btnUninstall.Enabled = true;
                btnBrowse.Enabled = true;
            }
        }

        private async Task DownloadAssetAsync(ReleaseAssetInfo asset, string destPath, CancellationToken token)
        {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(asset.DownloadUrl);
            req.UserAgent = "AC-Car-Studio-Online-Installer/1.0";
            req.AllowAutoRedirect = true;

            using (WebResponse resp = await req.GetResponseAsync())
            using (Stream netStream = resp.GetResponseStream())
            using (FileStream fileStream = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, true))
            {
                long total = resp.ContentLength > 0 ? resp.ContentLength : asset.Size;
                long downloaded = 0;
                byte[] buffer = new byte[65536];
                Stopwatch sw = Stopwatch.StartNew();
                long lastUiUpdateMs = 0;

                while (true)
                {
                    token.ThrowIfCancellationRequested();
                    int read = await netStream.ReadAsync(buffer, 0, buffer.Length, token);
                    if (read <= 0) break;

                    await fileStream.WriteAsync(buffer, 0, read, token);
                    downloaded += read;

                    long elapsedMs = sw.ElapsedMilliseconds;
                    if (elapsedMs - lastUiUpdateMs >= 80)
                    {
                        lastUiUpdateMs = elapsedMs;
                        int pct = total > 0 ? (int)Math.Min(97L, (downloaded * 97L) / total) : 50;
                        double mbDone = downloaded / (1024.0 * 1024.0);
                        double mbTotal = total / (1024.0 * 1024.0);
                        double speedMbs = elapsedMs > 0 ? (mbDone / (elapsedMs / 1000.0)) : 0.0;

                        progressBar.Value = pct;
                        lblProgressDetail.Text = String.Format("{0:0.1} / {1:0.1} MB ({2:0.1} MB/s)", mbDone, mbTotal, speedMbs);
                    }
                }
            }
        }

        internal static void VerifyDownloadedExe(string filePath, string expectedSha256)
        {
            FileInfo fi = new FileInfo(filePath);
            if (!fi.Exists || fi.Length < 1024 * 1024)
            {
                throw new InvalidDataException("ダウンロードされたファイルサイズが不正です。");
            }

            byte[] magic = new byte[2];
            using (FileStream fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                fs.Read(magic, 0, 2);
            }
            if (magic[0] != 0x4D || magic[1] != 0x5A) // 'MZ'
            {
                throw new InvalidDataException("有効な Windows 実行ファイル (PE) ではありません。");
            }

            if (!String.IsNullOrEmpty(expectedSha256))
            {
                using (SHA256 sha = SHA256.Create())
                using (FileStream fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    byte[] hash = sha.ComputeHash(fs);
                    StringBuilder sb = new StringBuilder(hash.Length * 2);
                    foreach (byte b in hash) sb.Append(b.ToString("x2"));
                    string actual = sb.ToString();
                    if (!String.Equals(actual, expectedSha256, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidDataException("SHA-256 ハッシュ検証に失敗しました。破損したダウンロードの可能性があります。");
                    }
                }
            }
        }

        internal static void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string description)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;
                object shell = Activator.CreateInstance(shellType);
                object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                Type scType = shortcut.GetType();
                scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
                scType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { description });
                scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath + ",0" });
                scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            catch
            {
                // Ignore shortcut creation failure on restricted environments
            }
        }

        internal static void RegisterUninstallerInRegistry(string installDir, string mainExe, string uninstallerExe, string version)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallRegKeyPath))
                {
                    if (key == null) return;
                    key.SetValue("DisplayName", "AC Car Studio");
                    key.SetValue("DisplayVersion", version.TrimStart('v', 'V'));
                    key.SetValue("Publisher", "Lagularge");
                    key.SetValue("InstallLocation", installDir);
                    key.SetValue("DisplayIcon", mainExe);
                    key.SetValue("URLInfoAbout", "https://github.com/Lagularge/ac-car-studio");
                    key.SetValue("UninstallString", "\"" + uninstallerExe + "\" --uninstall");
                    key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                    key.SetValue("NoRepair", 0, RegistryValueKind.DWord);
                }
            }
            catch
            {
                // Non-fatal
            }
        }

        private void OnUninstallClick(object sender, EventArgs e)
        {
            string installDir = txtInstallDir.Text.Trim();
            if (MessageBox.Show(
                this,
                String.Format("AC Car Studio をアンインストールしますか？\r\n\r\n対象フォルダ:\r\n{0}", installDir),
                "アンインストール確認",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            ) != DialogResult.Yes)
            {
                return;
            }

            PerformUninstall(installDir, this);
        }

        internal static void PerformUninstall(string installDir, IWin32Window owner)
        {
            try
            {
                string desktopLnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "AC Car Studio.lnk");
                if (File.Exists(desktopLnk)) File.Delete(desktopLnk);

                string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "AC Car Studio");
                if (Directory.Exists(startMenuDir)) Directory.Delete(startMenuDir, true);

                Registry.CurrentUser.DeleteSubKeyTree(UninstallRegKeyPath, false);

                string mainExe = Path.Combine(installDir, "AC Car Studio.exe");
                if (File.Exists(mainExe)) File.Delete(mainExe);

                string verFile = Path.Combine(installDir, "version.txt");
                if (File.Exists(verFile)) File.Delete(verFile);

                MessageBox.Show(
                    owner,
                    "AC Car Studio のアンインストールが完了しました。",
                    "アンインストール完了",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    owner,
                    "アンインストール中にエラーが発生しました:\r\n" + ex.Message + "\r\n\r\nアプリが起動中の場合は終了してから再度お試しください。",
                    "エラー",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }

    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string defaultDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "AC Car Studio"
            );

            foreach (string arg in args)
            {
                if (String.Equals(arg, "--uninstall", StringComparison.OrdinalIgnoreCase))
                {
                    if (MessageBox.Show(
                        "AC Car Studio をアンインストールしますか？",
                        "AC Car Studio アンインストール",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Question
                    ) == DialogResult.Yes)
                    {
                        InstallerForm.PerformUninstall(defaultDir, null);
                    }
                    return 0;
                }
            }

            Application.Run(new InstallerForm());
            return 0;
        }
    }
}
