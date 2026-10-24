using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

[assembly: AssemblyTitle("同桌连接器 · Windows 64 位")]
[assembly: AssemblyProduct("同桌连接器")]
[assembly: AssemblyVersion("0.5.0.0")]
[assembly: AssemblyFileVersion("0.5.0.0")]

// The downloaded EXE is just a portable bundle. The actual visible application
// is self-contained WinUI 3, including its native Windows App SDK dependencies.
internal static class Bootstrap {
    [STAThread] private static int Main() {
        try {
            string root = Extract();
            string sidecar = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "connector.config.json");
            if (String.IsNullOrEmpty(Environment.GetEnvironmentVariable("AGENT_GAME_CONFIG")) && File.Exists(sidecar)) Environment.SetEnvironmentVariable("AGENT_GAME_CONFIG", sidecar);
            Process.Start(new ProcessStartInfo(Path.Combine(root, "TongZhuoConnector.exe")) { WorkingDirectory = root, UseShellExecute = false });
            return 0;
        } catch (Exception error) { MessageBox(IntPtr.Zero, "无法打开同桌连接器：\n" + error.Message, "同桌连接器", 0x10); return 1; }
    }
    private static string Extract() {
        var assembly = Assembly.GetExecutingAssembly(); string hash;
        using (var stream = assembly.GetManifestResourceStream("TongZhuo.Payload"))
        using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").Substring(0, 24);
        string cache = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TongZhuo", "connector-" + hash);
        Directory.CreateDirectory(Path.GetDirectoryName(cache));
        using (var extraction = new System.Threading.Mutex(false, "Local\\TongZhuo.Extract." + hash)) {
            try { extraction.WaitOne(); } catch (System.Threading.AbandonedMutexException) { }
            try {
                if (File.Exists(Path.Combine(cache, ".ready"))) return cache;
                string staging = cache + "-" + Guid.NewGuid().ToString("N"); Directory.CreateDirectory(staging);
                string prefix = Path.GetFullPath(staging) + Path.DirectorySeparatorChar;
                using (var stream = assembly.GetManifestResourceStream("TongZhuo.Payload"))
                using (var zip = new ZipArchive(stream, ZipArchiveMode.Read)) {
                    foreach (var entry in zip.Entries) {
                        string target = Path.GetFullPath(Path.Combine(staging, entry.FullName));
                        if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Invalid bundle path.");
                        if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(target); continue; }
                        Directory.CreateDirectory(Path.GetDirectoryName(target)); entry.ExtractToFile(target);
                    }
                }
                File.WriteAllText(Path.Combine(staging, ".ready"), hash);
                if (Directory.Exists(cache)) return staging;
                Directory.Move(staging, cache); return cache;
            } finally { extraction.ReleaseMutex(); }
        }
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int MessageBox(IntPtr window, string text, string caption, uint type);
}
