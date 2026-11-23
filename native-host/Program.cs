using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace AcCarStudioHost
{
    internal static class Program
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr LoadLibraryW(string lpFileName);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static int Main(string[] args)
        {
            // Self-test CLI mode for automated verification of native ACD codec & JSON helpers
            if (args != null && args.Length > 0 && args[0] == "--self-test")
            {
                return RunSelfTest();
            }

            bool smokeTest = args != null && args.Length > 0 && args[0] == "--smoke-test";

            try { SetProcessDPIAware(); } catch { }

            // Resolve embedded managed WebView2 DLLs directly from single-file EXE resources
            AppDomain.CurrentDomain.AssemblyResolve += OnAssemblyResolve;

            // Extract and preload embedded native WebView2Loader.dll (160 KB) once into LocalAppData
            PreloadEmbeddedWebView2Loader();

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            return RunMainForm(smokeTest);
        }

        [MethodImpl(MethodImplOptions.NoInlining)]
        private static int RunMainForm(bool smokeTest)
        {
            var form = new MainForm(smokeTest);
            Application.Run(form);
            return form.ExitCode;
        }

        private static Assembly OnAssemblyResolve(object sender, ResolveEventArgs args)
        {
            string dllName = new AssemblyName(args.Name).Name + ".dll";
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(dllName))
            {
                if (stream == null) return null;
                byte[] data = new byte[stream.Length];
                stream.Read(data, 0, data.Length);
                return Assembly.Load(data);
            }
        }

        private static void PreloadEmbeddedWebView2Loader()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("WebView2Loader.dll"))
            {
                if (stream == null) return;
                string loaderDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ac-car-studio",
                    "runtime",
                    "wv2_1.0.2903.40"
                );
                Directory.CreateDirectory(loaderDir);
                string loaderPath = Path.Combine(loaderDir, "WebView2Loader.dll");
                if (!File.Exists(loaderPath) || new FileInfo(loaderPath).Length != stream.Length)
                {
                    try
                    {
                        using (var fs = new FileStream(loaderPath, FileMode.Create, FileAccess.Write, FileShare.Read))
                        {
                            stream.CopyTo(fs);
                        }
                    }
                    catch { }
                }
                if (File.Exists(loaderPath)) LoadLibraryW(loaderPath);
            }
        }

        private static int RunSelfTest()
        {
            string key = AcdCodec.GenerateAcdKey("ks_audi_sport_quattro");
            if (key != "230-190-101-8-154-33-64-112")
            {
                Console.Error.WriteLine("ACD key mismatch: " + key);
                return 2;
            }
            var input = new Dictionary<string, byte[]>
            {
                ["car.ini"] = Encoding.UTF8.GetBytes("[HEADER]\nVERSION=2\n"),
                ["power.lut"] = Encoding.UTF8.GetBytes("0|100\n7000|350\n"),
            };
            var packed = AcdCodec.PackAcdBuffer(input, "ks_audi_sport_quattro");
            var unpacked = AcdCodec.UnpackAcdBuffer(packed.Buffer, "ks_audi_sport_quattro");
            if (unpacked.Files.Count != 2 || Encoding.UTF8.GetString(unpacked.Files["car.ini"]) != "[HEADER]\nVERSION=2\n")
            {
                Console.Error.WriteLine("ACD round-trip mismatch");
                return 3;
            }
            Console.WriteLine("NATIVE_HOST_SELF_TEST_PASS: key=" + key);
            return 0;
        }
    }
}
