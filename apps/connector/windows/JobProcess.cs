using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace TongZhuo {
    // The job handle is owned ONLY by this launcher, never inherited. Windows
    // kills all descendants when the handle closes, including if the launcher
    // is force-killed and managed finally/ProcessExit handlers cannot execute.
    internal sealed class JobProcess : IDisposable {
        private IntPtr job = IntPtr.Zero;
        private IntPtr process = IntPtr.Zero;
        private StreamWriter? input;
        private readonly object gate = new object();
        private bool disposed;
        public int Pid { get; private set; }
        public event Action<string>? Output;
        public event Action<int>? Exited;

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
            if (!Native.SetHandleInformation(outputRead, 1, 0) || !Native.SetHandleInformation(inputWrite, 1, 0)) {
                var error = new Win32Exception();
                foreach (var handle in new[] { outputRead, outputWrite, inputRead, inputWrite }) Native.CloseHandle(handle);
                throw error;
            }
            var start = new Native.StartupInfo();
            start.Size = Marshal.SizeOf(start); start.Flags = 0x00000100;
            start.StandardInput = inputRead; start.StandardOutput = outputWrite; start.StandardError = outputWrite;
            var child = new Native.ProcessInformation();
            string node = Path.Combine(root, "runtime", "node.exe");
            string entrypoint = Path.Combine(root, "dist", "connector", "index.cjs");
            var command = new StringBuilder("\"" + node + "\" \"" + entrypoint + "\"");
            bool started = false;
            try {
                // Assign the SUSPENDED child to the job BEFORE any Node code can
                // execute. This closes the usual spawn/assign orphan race.
                if (!Native.CreateProcess(node, command, IntPtr.Zero, IntPtr.Zero, true, 0x08000004, IntPtr.Zero, root, ref start, out child)) throw new Win32Exception();
                process = child.Process;
                Pid = (int)child.ProcessId;
                if (!Native.AssignProcessToJobObject(job, process)) { Native.TerminateProcess(process, 1); throw new Win32Exception(); }
                if (Native.ResumeThread(child.Thread) == UInt32.MaxValue) { Native.TerminateProcess(process, 1); throw new Win32Exception(); }
                started = true;
            } finally {
                if (child.Thread != IntPtr.Zero) Native.CloseHandle(child.Thread);
                Native.CloseHandle(outputWrite); Native.CloseHandle(inputRead);
                if (!started) { Native.CloseHandle(outputRead); Native.CloseHandle(inputWrite); }
            }
            input = new StreamWriter(new FileStream(new SafeFileHandle(inputWrite, true), FileAccess.Write), new UTF8Encoding(false)) { AutoFlush = true };
            var readHandle = new SafeFileHandle(outputRead, true);
            var readerThread = new Thread(delegate() {
                try {
                    using (var stream = new FileStream(readHandle, FileAccess.Read))
                    using (var reader = new StreamReader(stream, new UTF8Encoding(false))) {
                        string? line;
                        while ((line = reader.ReadLine()) != null) { var output = Output; if (output != null) output(line); }
                    }
                } catch (IOException) { }
            });
            readerThread.IsBackground = true; readerThread.Start();
            var ownedHandle = process;
            var waitThread = new Thread(delegate() {
                Native.WaitForSingleObject(ownedHandle, UInt32.MaxValue);
                uint code; Native.GetExitCodeProcess(ownedHandle, out code);
                var exited = Exited; if (exited != null) exited((int)code);
            });
            waitThread.IsBackground = true; waitThread.Start();
        }
        public void Wait() { if (process != IntPtr.Zero) Native.WaitForSingleObject(process, UInt32.MaxValue); }
        public async Task StopAsync() {
            try { input?.WriteLine("{\"command\":\"stop\"}"); } catch (IOException) { }
            var handle = process;
            if (handle != IntPtr.Zero) await Task.Run(() => Native.WaitForSingleObject(handle, 4000));
            await Task.Run(Dispose);
        }
        public void Dispose() {
            lock (gate) {
                if (disposed) return; disposed = true;
                try { input?.Dispose(); } catch (IOException) { }
                if (job != IntPtr.Zero) { Native.CloseHandle(job); job = IntPtr.Zero; }
                if (process != IntPtr.Zero) {
                    // Explicit exit waits for the owned listener to die.
                    Native.WaitForSingleObject(process, 5000);
                    Native.CloseHandle(process); process = IntPtr.Zero;
                }
            }
        }
    }

    internal static class Native {
        [StructLayout(LayoutKind.Sequential)] internal struct SecurityAttributes { public int Length; public IntPtr SecurityDescriptor; [MarshalAs(UnmanagedType.Bool)] public bool InheritHandle; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] internal struct StartupInfo { public int Size; public string Reserved, Desktop, Title; public int X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags; public short ShowWindow, Reserved2Size; public IntPtr Reserved2, StandardInput, StandardOutput, StandardError; }
        [StructLayout(LayoutKind.Sequential)] internal struct ProcessInformation { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
        [StructLayout(LayoutKind.Sequential)] internal struct BasicLimitInformation { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
        [StructLayout(LayoutKind.Sequential)] internal struct IoCounters { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
        [StructLayout(LayoutKind.Sequential)] internal struct ExtendedLimitInformation { public BasicLimitInformation BasicLimitInformation; public IoCounters IoInfo; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern IntPtr CreateJobObject(IntPtr attributes, string? name);
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
