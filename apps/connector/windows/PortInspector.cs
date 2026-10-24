using System.ComponentModel;
using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;

namespace TongZhuo;

internal sealed record PortOwner(int Pid, string Name, string? Path, DateTime? StartTime, List<string> Addresses, bool Owned, bool Cooperative, string Kind);

internal static class PortInspector {
    internal static async Task<List<PortOwner>> InspectAsync(int port, int ownedPid) {
        var listeners = await Task.Run(() => Listeners(port));
        var peer = listeners.Count == 0 ? null : await LauncherPipe.SendAsync(port, "status");
        int cooperativePid = peer?.GetProperty("listenerPid").GetInt32() ?? 0;
        return await Task.Run(() => listeners.GroupBy(l => l.Pid).Select(group => {
            int pid = group.Key; string name = "无法读取进程名称"; string? path = null; DateTime? start = null;
            try {
                using var process = Process.GetProcessById(pid);
                name = process.ProcessName;
                try { path = process.MainModule?.FileName; } catch (Win32Exception) { }
                try { start = process.StartTime.ToUniversalTime(); } catch (Win32Exception) { }
            } catch (Exception e) when (e is ArgumentException or InvalidOperationException or Win32Exception) { }
            bool own = pid == ownedPid;
            bool cooperative = !own && pid == cooperativePid;
            bool embedded = path is not null && (path.Contains("\\AgentArcade\\runtime-", StringComparison.OrdinalIgnoreCase) || path.Contains("\\TongZhuo\\connector-", StringComparison.OrdinalIgnoreCase)) && path.EndsWith("\\runtime\\node.exe", StringComparison.OrdinalIgnoreCase);
            string kind = own ? "本连接器启动的服务" : cooperative ? "另一实例的连接器（支持正常退出）" : embedded ? "旧版或残留的连接器运行时（按完整路径识别）" : "其他程序／身份未确认";
            return new PortOwner(pid, name, path, start, group.Select(g => g.Address).Distinct().ToList(), own, cooperative, kind);
        }).OrderBy(p => p.Pid).ToList());
    }

    internal static Task<string> TerminateAsync(int port, PortOwner expected) => Task.Run(() => {
        if (expected.StartTime is null || expected.Pid <= 4 || expected.Pid == Environment.ProcessId) return "无法安全确认目标身份，未执行结束操作。请在原程序中退出。";
        try {
            using var process = Process.GetProcessById(expected.Pid);
            // Open and retain the process handle before comparing creation time.
            // PID reuse cannot redirect Kill() to a different process.
            _ = process.SafeHandle;
            if (process.StartTime.ToUniversalTime() != expected.StartTime || (expected.Path is not null && process.MainModule?.FileName != expected.Path)) return "目标身份已经变化，未执行结束操作。";
            if (!Listeners(port).Any(p => p.Pid == expected.Pid)) return "该进程已不再监听此端口，未执行结束操作。";
            process.Kill(entireProcessTree: false);
            return process.WaitForExit(2000) ? $"PID {expected.Pid} 已结束，已重新检测监听状态。" : $"已向 PID {expected.Pid} 请求强制结束，但尚未确认退出。请稍候后重试检测。";
        } catch (ArgumentException) { return "该进程已经退出，已重新检测端口。"; }
        catch (InvalidOperationException) { return "该进程已经退出，已重新检测端口。"; }
        catch (Win32Exception e) when (e.NativeErrorCode == 5) { return "没有结束此进程的权限。请保存原程序任务并在其界面退出，再重新检测；连接器不会自行提权。"; }
    });

    private sealed record Listener(int Pid, string Address);
    private static List<Listener> Listeners(int port) {
        var list = new List<Listener>();
        foreach (int family in new[] { 2, 23 }) {
            int bytes = 0;
            uint error = GetExtendedTcpTable(IntPtr.Zero, ref bytes, false, family, 3, 0); // OWNER_PID_LISTENER
            if (error == 50 && family == 23) continue;
            if (error != 122 && error != 0) throw new Win32Exception((int)error);
            if (bytes == 0) continue;
            IntPtr table = Marshal.AllocHGlobal(bytes);
            try {
                error = GetExtendedTcpTable(table, ref bytes, false, family, 3, 0);
                if (error == 122) { Marshal.FreeHGlobal(table); table = Marshal.AllocHGlobal(bytes); error = GetExtendedTcpTable(table, ref bytes, false, family, 3, 0); }
                if (error != 0) throw new Win32Exception((int)error);
                int count = Marshal.ReadInt32(table), size = family == 2 ? 24 : 56;
                if (count < 0 || (long)count * size + 4 > bytes) throw new IOException("系统返回了无效的 TCP 监听信息，请重新检测。");
                for (int i = 0; i < count; i++) {
                    IntPtr row = table + 4 + i * size;
                    int portOffset = family == 2 ? 8 : 20;
                    int localPort = (Marshal.ReadByte(row, portOffset) << 8) | Marshal.ReadByte(row, portOffset + 1);
                    if (localPort != port) continue;
                    int pid = Marshal.ReadInt32(row, family == 2 ? 20 : 52);
                    string address;
                    if (family == 2) address = new IPAddress((uint)Marshal.ReadInt32(row, 4)) + ":" + port;
                    else { var ip = new byte[16]; Marshal.Copy(row, ip, 0, 16); address = $"[{new IPAddress(ip, (uint)Marshal.ReadInt32(row, 16))}]:{port}"; }
                    list.Add(new Listener(pid, address));
                }
            } finally { Marshal.FreeHGlobal(table); }
        }
        return list;
    }
    [DllImport("iphlpapi.dll", SetLastError = true)] private static extern uint GetExtendedTcpTable(IntPtr table, ref int size, [MarshalAs(UnmanagedType.Bool)] bool order, int family, int tableClass, uint reserved);
}
