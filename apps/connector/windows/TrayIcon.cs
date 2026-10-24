using System.ComponentModel;
using System.Runtime.InteropServices;

namespace TongZhuo;

// WinUI supplies the actual window and controls. This small Win32 adapter owns
// only the shell notification icon, its system context menu and window limits.
internal sealed class TrayIcon : IDisposable {
    private readonly IntPtr window, icon;
    private readonly Subclass callback;
    private readonly Action show, game, quit;
    private NotifyData data;
    private bool disposed;
    internal bool Available { get; private set; }
    private readonly uint taskbarCreated = RegisterWindowMessage("TaskbarCreated");
    internal static uint WindowDpi(IntPtr window) => GetDpiForWindow(window);
    internal static void CaptionTheme(IntPtr window, bool dark) { int value = dark ? 1 : 0; DwmSetWindowAttribute(window, 20, ref value, sizeof(int)); }
    internal TrayIcon(IntPtr window, Action show, Action game, Action quit) {
        this.window = window; this.show = show; this.game = game; this.quit = quit;
        int dpi = (int)GetDpiForWindow(window), size = Math.Max(16, 16 * dpi / 96);
        icon = LoadImage(IntPtr.Zero, Path.Combine(AppContext.BaseDirectory, "connector.ico"), 1, size, size, 0x10);
        if (icon == IntPtr.Zero) throw new Win32Exception("无法读取托盘图标。关闭窗口将退出连接器。");
        callback = WindowProcedure;
        if (!SetWindowSubclass(window, callback, 1, 0)) { DestroyIcon(icon); throw new Win32Exception("无法建立托盘窗口入口。关闭窗口将退出连接器。"); }
        data = new NotifyData { cbSize = (uint)Marshal.SizeOf<NotifyData>(), hWnd = window, uID = 1, uFlags = 1 | 2 | 4, uCallbackMessage = 0x8001, hIcon = icon, szTip = "同桌连接器", szInfo = "", szInfoTitle = "" };
        Available = Shell_NotifyIcon(0, ref data);
        if (!Available) { RemoveWindowSubclass(window, callback, 1); DestroyIcon(icon); throw new Win32Exception("通知区域暂不可用。关闭窗口将退出连接器，可稍后重新打开。"); }
    }
    internal void SetText(string value) { if (disposed) return; data.szTip = value.Length > 127 ? value[..127] : value; Shell_NotifyIcon(1, ref data); }
    private IntPtr WindowProcedure(IntPtr hwnd, uint message, UIntPtr w, IntPtr l, UIntPtr id, UIntPtr reference) {
        if (message == taskbarCreated) Available = Shell_NotifyIcon(0, ref data);
        if (message == 0x24) {
            var limits = Marshal.PtrToStructure<MinMaxInfo>(l); int dpi = (int)GetDpiForWindow(window);
            limits.minTrack.x = 620 * dpi / 96; limits.minTrack.y = 460 * dpi / 96; Marshal.StructureToPtr(limits, l, false);
        }
        if (message == 0x8001) {
            long action = l.ToInt64() & 0xffff;
            if (action == 0x202 || action == 0x203 || action == 0x400) show();
            if (action == 0x205 || action == 0x7b) {
                IntPtr menu = CreatePopupMenu();
                try {
                    AppendMenu(menu, 0, 1, "打开连接器"); AppendMenu(menu, 0, 2, "打开游戏网页"); AppendMenu(menu, 0x800, 0, ""); AppendMenu(menu, 0, 3, "退出连接器");
                    GetCursorPos(out var point); SetForegroundWindow(window);
                    uint selected = TrackPopupMenu(menu, 0x100 | 2, point.x, point.y, 0, window, IntPtr.Zero);
                    if (selected == 1) show(); else if (selected == 2) game(); else if (selected == 3) quit();
                    PostMessage(window, 0, UIntPtr.Zero, IntPtr.Zero);
                } finally { DestroyMenu(menu); }
            }
        }
        return DefSubclassProc(hwnd, message, w, l);
    }
    public void Dispose() { if (disposed) return; disposed = true; Available = false; Shell_NotifyIcon(2, ref data); RemoveWindowSubclass(window, callback, 1); if (icon != IntPtr.Zero) DestroyIcon(icon); }
    private delegate IntPtr Subclass(IntPtr window, uint message, UIntPtr w, IntPtr l, UIntPtr id, UIntPtr reference);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct NotifyData {
        public uint cbSize; public IntPtr hWnd; public uint uID, uFlags, uCallbackMessage; public IntPtr hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
        public uint dwState, dwStateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
        public uint uTimeoutOrVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
        public uint dwInfoFlags; public Guid guidItem; public IntPtr hBalloonIcon;
    }
    [StructLayout(LayoutKind.Sequential)] private struct Point { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] private struct MinMaxInfo { public Point reserved, maxSize, maxPosition, minTrack, maxTrack; }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern bool Shell_NotifyIcon(uint message, ref NotifyData data);
    [DllImport("comctl32.dll")] private static extern bool SetWindowSubclass(IntPtr window, Subclass proc, UIntPtr id, UIntPtr reference);
    [DllImport("comctl32.dll")] private static extern bool RemoveWindowSubclass(IntPtr window, Subclass proc, UIntPtr id);
    [DllImport("comctl32.dll")] private static extern IntPtr DefSubclassProc(IntPtr window, uint message, UIntPtr w, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint RegisterWindowMessage(string message);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr LoadImage(IntPtr instance, string path, uint type, int x, int y, uint flags);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool AppendMenu(IntPtr menu, uint flags, UIntPtr id, string text);
    [DllImport("user32.dll")] private static extern uint TrackPopupMenu(IntPtr menu, uint flags, int x, int y, int reserved, IntPtr window, IntPtr rect);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool DestroyMenu(IntPtr menu);
    [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr icon);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr window, uint message, UIntPtr w, IntPtr l);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr window, uint attribute, ref int value, int size);
}
