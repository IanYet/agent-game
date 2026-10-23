using System;
using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32.SafeHandles;

[assembly: AssemblyTitle("同桌 · 本地连接器")]
[assembly: AssemblyDescription("Portable local bridge for Agent Arcade")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

namespace AgentArcade {
    internal static class Program {
        [STAThread]
        private static int Main(string[] args) {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            bool headless = Array.IndexOf(args, "--headless") >= 0;
            int exitAfter = 0;
            foreach (string arg in args) if (arg.StartsWith("--exit-after-ms=")) Int32.TryParse(arg.Substring("--exit-after-ms=".Length), out exitAfter);
            int port = 3211;
            string configuredPort = Environment.GetEnvironmentVariable("AGENT_GAME_PORT");
            if (!String.IsNullOrEmpty(configuredPort) && (!Int32.TryParse(configuredPort, out port) || port < 1024 || port > 65535)) return 2;
            bool first;
            using (var instance = new Mutex(true, "Local\\AgentArcade.Connector." + port, out first)) {
                if (!first) {
                    if (!headless) MessageBox.Show("本地连接器已经在运行。请回到游戏网页，点击「连接 Codex」。", "同桌", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }
                try {
                    string root = ExtractPayload();
                    string sidecar = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "connector.config.json");
                    if (File.Exists(sidecar)) File.Copy(sidecar, Path.Combine(root, "connector.config.json"), true);
                    if (headless) {
                        using (var process = new JobProcess()) { process.Start(root); if (exitAfter > 0) Thread.Sleep(exitAfter); else process.Wait(); }
                    } else {
                        Application.Run(new ConnectorWindow(root, port));
                    }
                    return 0;
                } catch (Exception error) {
                    if (!headless) MessageBox.Show("连接器启动失败：" + error.Message, "同桌", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                } finally { instance.ReleaseMutex(); }
            }
        }

        private static string ExtractPayload() {
            var assembly = Assembly.GetExecutingAssembly();
            string hash;
            using (var stream = assembly.GetManifestResourceStream("AgentArcade.Payload"))
            using (var sha = SHA256.Create()) { hash = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").Substring(0, 20); }
            string cache = Path.Combine(Path.GetTempPath(), "AgentArcade", "runtime-" + hash);
            if (File.Exists(Path.Combine(cache, ".ready"))) return cache;
            string staging = cache + "-" + Guid.NewGuid().ToString("N");
            Directory.CreateDirectory(staging);
            string prefix = Path.GetFullPath(staging).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            using (var stream = assembly.GetManifestResourceStream("AgentArcade.Payload"))
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Read)) {
                foreach (var entry in archive.Entries) {
                    string path = Path.GetFullPath(Path.Combine(staging, entry.FullName));
                    if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Invalid embedded runtime path.");
                    if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(path); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    entry.ExtractToFile(path);
                }
            }
            File.WriteAllText(Path.Combine(staging, ".ready"), hash);
            if (!Directory.Exists(cache)) { Directory.Move(staging, cache); return cache; }
            return staging;
        }
    }

    // The job handle is owned ONLY by this launcher, never inherited. Windows
    // kills all descendants when the handle closes, including if the launcher
    // is force-killed and managed finally/ProcessExit handlers cannot execute.
    internal sealed class JobProcess : IDisposable {
        private IntPtr job = IntPtr.Zero;
        private IntPtr process = IntPtr.Zero;
        private readonly object gate = new object();
        private bool disposed;
        public event Action<string> Output;
        public event Action<int> Exited;

        public void Start(string root) {
            job = Native.CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw new Win32Exception();
            var limits = new Native.ExtendedLimitInformation();
            limits.BasicLimitInformation.LimitFlags = 0x00002000; // KILL_ON_JOB_CLOSE
            if (!Native.SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits))) throw new Win32Exception();
            var security = new Native.SecurityAttributes();
            security.Length = Marshal.SizeOf(security); security.InheritHandle = true;
            IntPtr outputRead, outputWrite, inputRead, inputWrite;
            if (!Native.CreatePipe(out outputRead, out outputWrite, ref security, 0)) throw new Win32Exception();
            if (!Native.CreatePipe(out inputRead, out inputWrite, ref security, 0)) { Native.CloseHandle(outputRead); Native.CloseHandle(outputWrite); throw new Win32Exception(); }
            Native.SetHandleInformation(outputRead, 1, 0); Native.SetHandleInformation(inputWrite, 1, 0);
            var start = new Native.StartupInfo();
            start.Size = Marshal.SizeOf(start); start.Flags = 0x00000100;
            start.StandardInput = inputRead; start.StandardOutput = outputWrite; start.StandardError = outputWrite;
            var child = new Native.ProcessInformation();
            string node = Path.Combine(root, "runtime", "node.exe");
            string entrypoint = Path.Combine(root, "dist", "connector", "index.cjs");
            var command = new StringBuilder("\"" + node + "\" \"" + entrypoint + "\"");
            try {
                // Assign the SUSPENDED child to the job BEFORE any Node code can
                // execute. This closes the usual spawn/assign orphan race.
                if (!Native.CreateProcess(node, command, IntPtr.Zero, IntPtr.Zero, true, 0x08000004, IntPtr.Zero, root, ref start, out child)) throw new Win32Exception();
                process = child.Process;
                if (!Native.AssignProcessToJobObject(job, process)) { Native.TerminateProcess(process, 1); throw new Win32Exception(); }
                if (Native.ResumeThread(child.Thread) == UInt32.MaxValue) { Native.TerminateProcess(process, 1); throw new Win32Exception(); }
            } finally {
                if (child.Thread != IntPtr.Zero) Native.CloseHandle(child.Thread);
                Native.CloseHandle(outputWrite); Native.CloseHandle(inputRead); Native.CloseHandle(inputWrite);
            }
            var readHandle = new SafeFileHandle(outputRead, true);
            var readerThread = new Thread(delegate() {
                try {
                    using (var stream = new FileStream(readHandle, FileAccess.Read))
                    using (var reader = new StreamReader(stream, new UTF8Encoding(false))) {
                        string line;
                        while ((line = reader.ReadLine()) != null) { var output = Output; if (output != null) output(line); }
                    }
                } catch (IOException) { }
            });
            readerThread.IsBackground = true; readerThread.Start();
            var waitThread = new Thread(delegate() {
                Native.WaitForSingleObject(process, UInt32.MaxValue);
                uint code; Native.GetExitCodeProcess(process, out code);
                var exited = Exited; if (exited != null) exited((int)code);
            });
            waitThread.IsBackground = true; waitThread.Start();
        }
        public void Wait() { if (process != IntPtr.Zero) Native.WaitForSingleObject(process, UInt32.MaxValue); }
        public void Dispose() {
            lock (gate) {
                if (disposed) return; disposed = true;
                if (job != IntPtr.Zero) { Native.CloseHandle(job); job = IntPtr.Zero; }
                if (process != IntPtr.Zero) {
                    // A normal window close waits for the owned listener to die.
                    if (Native.WaitForSingleObject(process, 5000) == 0x00000102) Native.TerminateProcess(process, 1);
                    Native.CloseHandle(process); process = IntPtr.Zero;
                }
            }
        }
    }

    internal sealed class ConnectorWindow : Form {
        private readonly JobProcess process = new JobProcess();
        private readonly Label status = new Label();
        private readonly Label detail = new Label();
        private readonly Label account = new Label();
        private readonly string root;
        private string lastLine = "请确认本机已安装 Codex，并使用 ChatGPT 订阅登录。";
        private bool stopping;
        private static readonly Color Green = Color.FromArgb(43, 97, 76);
        public ConnectorWindow(string runtimeRoot, int port) {
            root = runtimeRoot;
            Text = "同桌 · 本地连接器"; ClientSize = new Size(490, 345);
            FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen; BackColor = Color.FromArgb(247, 249, 243);
            Font = new Font("Microsoft YaHei UI", 9F);
            var logo = new LogoPanel(); logo.Location = new Point(25, 29); logo.Size = new Size(39, 39); Controls.Add(logo);
            var title = AddLabel("同桌 · 本地连接器", 78, 26, 375, 29, 16F, Green);
            title.Font = new Font("Microsoft YaHei UI", 16F, FontStyle.Bold);
            AddLabel("WINDOWS  /  PORTABLE", 80, 59, 350, 20, 8F, Color.FromArgb(141, 157, 128));
            var panel = new Panel(); panel.Location = new Point(25, 105); panel.Size = new Size(440, 100); panel.BackColor = Color.White; Controls.Add(panel);
            status.Text = "正在启动连接器…"; status.Location = new Point(19, 17); status.Size = new Size(405, 28); status.Font = new Font("Microsoft YaHei UI", 13F, FontStyle.Bold); status.ForeColor = Green; panel.Controls.Add(status);
            account.Text = "正在检测本机 Codex 登录"; account.Location = new Point(20, 55); account.Size = new Size(405, 29); account.ForeColor = Color.FromArgb(133, 151, 117); panel.Controls.Add(account);
            detail.Text = "启动后，回到游戏网页点击「连接 Codex」。"; detail.Location = new Point(27, 225); detail.Size = new Size(435, 37); detail.ForeColor = Color.FromArgb(114, 135, 96); Controls.Add(detail);
            AddLabel("本机端口  127.0.0.1:" + port, 28, 289, 270, 21, 8F, Color.FromArgb(155, 169, 141));
            var exit = new Button(); exit.Text = "退出连接器"; exit.Location = new Point(348, 280); exit.Size = new Size(117, 36); exit.BackColor = Green; exit.ForeColor = Color.White; exit.FlatStyle = FlatStyle.Flat; exit.FlatAppearance.BorderSize = 0; exit.Click += delegate { Close(); }; Controls.Add(exit);
            process.Output += HandleOutput;
            process.Exited += delegate(int code) { OnUI(delegate { if (!stopping) { process.Dispose(); status.Text = code == 0 ? "连接器已停止" : "连接器启动失败"; status.ForeColor = Color.FromArgb(166, 105, 72); detail.Text = lastLine; } }); };
            Shown += delegate { try { process.Start(root); } catch (Exception error) { status.Text = "连接器启动失败"; detail.Text = error.Message; process.Dispose(); } };
            FormClosing += delegate { stopping = true; process.Dispose(); };
        }
        private Label AddLabel(string text, int x, int y, int width, int height, float size, Color color) {
            var label = new Label(); label.Text = text; label.Location = new Point(x, y); label.Size = new Size(width, height); label.Font = new Font("Microsoft YaHei UI", size); label.ForeColor = color; Controls.Add(label); return label;
        }
        private void HandleOutput(string line) {
            if (line.Trim().Length > 0 && !line.StartsWith("AGENT_ARCADE_STATUS:")) lastLine = line.Trim();
            OnUI(delegate {
                if (line == "AGENT_ARCADE_STATUS:ready") { status.Text = "●  已就绪，等待网页连接"; detail.Text = "回到游戏网页，点击「连接 Codex」。"; }
                else if (line == "AGENT_ARCADE_STATUS:connected") { status.Text = "●  游戏网页已连接"; detail.Text = "关闭连接器会停止所有玩家任务，并释放本机端口。"; }
                else if (line.Trim().StartsWith("Codex：")) account.Text = line.Trim();
            });
        }
        private void OnUI(Action action) { if (IsDisposed || !IsHandleCreated) return; try { BeginInvoke(action); } catch (InvalidOperationException) { } }
    }
    internal sealed class LogoPanel : Panel {
        protected override void OnPaint(PaintEventArgs e) {
            Color[] colors = { Color.FromArgb(43, 97, 76), Color.FromArgb(142, 167, 119), Color.FromArgb(176, 195, 148), Color.FromArgb(62, 112, 78) };
            for (int i = 0; i < 4; i++) using (var brush = new SolidBrush(colors[i])) e.Graphics.FillRectangle(brush, (i % 2) * 21, (i / 2) * 21, 17, 17);
        }
    }
    internal static class Native {
        [StructLayout(LayoutKind.Sequential)] internal struct SecurityAttributes { public int Length; public IntPtr SecurityDescriptor; [MarshalAs(UnmanagedType.Bool)] public bool InheritHandle; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] internal struct StartupInfo { public int Size; public string Reserved, Desktop, Title; public int X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags; public short ShowWindow, Reserved2Size; public IntPtr Reserved2, StandardInput, StandardOutput, StandardError; }
        [StructLayout(LayoutKind.Sequential)] internal struct ProcessInformation { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
        [StructLayout(LayoutKind.Sequential)] internal struct BasicLimitInformation { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
        [StructLayout(LayoutKind.Sequential)] internal struct IoCounters { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
        [StructLayout(LayoutKind.Sequential)] internal struct ExtendedLimitInformation { public BasicLimitInformation BasicLimitInformation; public IoCounters IoInfo; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] internal static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimitInformation info, uint length);
        [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] internal static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] internal static extern bool CreateProcess(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInformation info);
        [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] internal static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SecurityAttributes attributes, uint size);
        [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] internal static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] internal static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
        [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] internal static extern bool TerminateProcess(IntPtr process, uint exitCode);
        [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] internal static extern bool CloseHandle(IntPtr handle);
    }
}
