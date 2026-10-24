using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Windowing;
using Windows.Graphics;

[assembly: AssemblyTitle("同桌连接器")]
[assembly: AssemblyProduct("同桌连接器")]
[assembly: AssemblyVersion("0.4.3.0")]
[assembly: AssemblyFileVersion("0.4.3.0")]
[assembly: System.Runtime.Versioning.SupportedOSPlatform("windows10.0.19041.0")]

namespace TongZhuo;

public partial class App : Application {
    private Mutex? instance;
    private MainWindow? window;
    public App() {
        UnhandledException += (_, e) => {
            e.Handled = true;
            string folder = Environment.GetEnvironmentVariable("AGENT_GAME_DATA_DIR") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AgentArcade");
            Directory.CreateDirectory(folder); File.WriteAllText(Path.Combine(folder, "launcher-error.log"), e.Exception.ToString());
            StartupMessage(IntPtr.Zero, "连接器界面未能打开：\n" + e.Exception.Message + "\n\n详情：" + Path.Combine(folder, "launcher-error.log"), "同桌连接器", 0x10);
            Exit();
        };
        InitializeComponent();
    }
    [System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint = "MessageBoxW", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    private static extern int StartupMessage(IntPtr window, string text, string caption, uint flags);
    protected override async void OnLaunched(LaunchActivatedEventArgs args) {
        string? configurationError = null;
        string raw = Environment.GetEnvironmentVariable("AGENT_GAME_PORT") ?? "3211";
        if (!int.TryParse(raw, out int port) || port < 1024 || port > 65535) {
            port = 3211; configurationError = $"AGENT_GAME_PORT「{raw}」无效。请改为 1024–65535 的整数后重新打开连接器。";
        }
        instance = new Mutex(true, $"Local\\TongZhuo.Connector.UI.{port}", out bool first);
        if (!first && await LauncherPipe.SendAsync(port, "show") is not null) { Exit(); return; }
        window = new MainWindow(port, configurationError ?? (!first ? "另一个连接器窗口未响应，请从它的托盘退出后重试。" : null));
        window.Activate();
        await window.InitializeAsync(first);
    }
}

internal sealed class MainWindow : Window {
    private static readonly Version CurrentVersion = Assembly.GetExecutingAssembly().GetName().Version!;
    private static readonly string CurrentVersionText = CurrentVersion.ToString(3);
    internal const string GameUrl = "https://ianyet.github.io/agent-game/";
    internal const string ReleasesUrl = "https://github.com/IanYet/agent-game/releases/latest";
    private readonly int port;
    private readonly string? configurationError;
    private readonly NavigationView navigation = new() { IsBackButtonVisible = NavigationViewBackButtonVisible.Collapsed, IsSettingsVisible = false, OpenPaneLength = 224, ExpandedModeThresholdWidth = 900 };
    private readonly Dictionary<string, ScrollViewer> pages = new();
    private readonly InfoBar status = new() { IsOpen = true, IsClosable = false };
    private readonly InfoBar portNotice = new() { IsOpen = true, IsClosable = false };
    private readonly ProgressBar progress = new() { IsIndeterminate = true, Visibility = Visibility.Collapsed };
    private readonly TextBlock serviceText = Text("正在启动…", true), browserText = Text("等待本机服务"), programsText = Text("正在检测…");
    private readonly TextBlock versionText = Text("当前版本 v" + CurrentVersionText), updateText = Text("手动检查 GitHub 正式发行版。"), portSummary = Text("");
    private readonly StackPanel programRows = new() { Spacing = 8 }, listenerRows = new() { Spacing = 8 };
    private readonly Button start = Button("启动连接器"), stop = Button("停止服务"), scan = Button("重新检测"), detect = Button("重新检测程序"), update = Button("检查更新");
    private readonly string data = Environment.GetEnvironmentVariable("AGENT_GAME_DATA_DIR") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AgentArcade");
    private JobProcess? process;
    private LauncherPipe? pipe;
    private TrayIcon? tray;
    private bool running, connected, busy, quitting, checking, updateAvailable;
    private List<PortOwner> owners = new();
    private string lastError = "";

    public MainWindow(int port, string? error) {
        this.port = port; configurationError = error;
        Title = "同桌连接器";
        SystemBackdrop = new MicaBackdrop();
        double scale = TrayIcon.WindowDpi(WinRT.Interop.WindowNative.GetWindowHandle(this)) / 96.0;
        var work = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Primary).WorkArea;
        int width = Math.Min((int)(1040 * scale), work.Width - (int)(32 * scale));
        int height = Math.Min((int)(820 * scale), work.Height - (int)(32 * scale));
        AppWindow.MoveAndResize(new RectInt32(work.X + (work.Width - width) / 2, work.Y + (work.Height - height) / 2, width, height));
        AppWindow.SetIcon(Path.Combine(AppContext.BaseDirectory, "connector.ico"));
        Content = navigation;
        navigation.ActualThemeChanged += (_, _) => TrayIcon.CaptionTheme(WinRT.Interop.WindowNative.GetWindowHandle(this), navigation.ActualTheme == ElementTheme.Dark);
        var brand = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, Margin = new Thickness(16, 14, 8, 20) };
        brand.Children.Add(new Image { Source = new BitmapImage(new Uri(Path.Combine(AppContext.BaseDirectory, "brand.png"))), Width = 36, Height = 36 });
        var brandText = new StackPanel(); brandText.Children.Add(Text("同桌", true)); brandText.Children.Add(Text("本地连接器")); brand.Children.Add(brandText); navigation.PaneHeader = brand;
        AddNavigation("overview", "概览", Symbol.Home); AddNavigation("programs", "可用程序", Symbol.AllApps);
        AddNavigation("ports", "端口与进程", Symbol.Link); AddNavigation("about", "关于与更新", Symbol.Setting);
        BuildOverview(); BuildPrograms(); BuildPorts(); BuildAbout();
        navigation.SelectionChanged += (_, e) => { if (e.SelectedItem is NavigationViewItem item) ShowPage((string)item.Tag); };
        navigation.SelectedItem = navigation.MenuItems[0];
        start.Click += async (_, _) => await StartAsync(); stop.Click += async (_, _) => await StopAsync();
        scan.Click += async (_, _) => await ScanAsync();
        detect.Click += async (_, _) => {
            if (running && await ConfirmAsync("重新检测可用程序？", "这会重启本机服务，断开游戏网页并停止本次连接器启动的 Agent 会话。请先暂停牌局。", "重启并检测") != ContentDialogResult.Primary) return;
            await StopAsync(); await StartAsync();
        };
        update.Click += async (_, _) => { if (updateAvailable) Open(ReleasesUrl); else await CheckUpdatesAsync(); };
        AppWindow.Closing += async (_, e) => { if (!quitting) { e.Cancel = true; if (tray?.Available == true) AppWindow.Hide(); else await QuitAsync(); } };
        Closed += (_, _) => { tray?.Dispose(); pipe?.Dispose(); process?.Dispose(); Application.Current.Exit(); };
        UpdateControls();
    }
    internal async Task InitializeAsync(bool hostPipe) {
        try {
            Directory.CreateDirectory(data);
            tray = new TrayIcon(WinRT.Interop.WindowNative.GetWindowHandle(this), Restore, () => Open(GameUrl), async () => await QuitAsync());
            if (hostPipe) pipe = new LauncherPipe(port, () => process?.Pid ?? 0, Restore, async () => await QuitAsync(), DispatcherQueue);
            if (configurationError is not null) { SetStatus("无法启动", configurationError, InfoBarSeverity.Error); return; }
            await StartAsync();
        } catch (Exception e) { SetStatus("无法启动", e.Message, InfoBarSeverity.Error); }
    }
    private void AddNavigation(string key, string label, Symbol symbol) => navigation.MenuItems.Add(new NavigationViewItem { Content = label, Tag = key, Icon = new SymbolIcon(symbol) });
    private void ShowPage(string key) { navigation.Header = key switch { "programs" => "可用程序", "ports" => "端口与进程", "about" => "关于与更新", _ => "概览" }; navigation.Content = pages[key]; if (key == "ports" && !busy) _ = ScanAsync(); }
    private StackPanel Page(string key) {
        var panel = new StackPanel { Spacing = 12, MaxWidth = 980, HorizontalAlignment = HorizontalAlignment.Stretch, Margin = new Thickness(28, 8, 28, 28) };
        pages[key] = new ScrollViewer { Content = panel, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        return panel;
    }
    private void BuildOverview() {
        var p = Page("overview"); p.Children.Add(Text("让游戏网页与本机的 Agent 程序连接。")); p.Children.Add(status); p.Children.Add(progress);
        p.Children.Add(SettingsRow("本机服务", Symbol.Home, Actions(start, stop), serviceText, Text($"127.0.0.1:{port} · 仅此电脑可访问")));
        var open = Button("打开游戏网页"); open.Click += (_, _) => Open(GameUrl);
        p.Children.Add(SettingsRow("游戏网页", Symbol.Link, open, browserText, Text("在网页点击「连接本机」。")));
        var programs = Button("查看可用程序"); programs.Click += (_, _) => navigation.SelectedItem = navigation.MenuItems[1];
        p.Children.Add(SettingsRow("Agent 程序", Symbol.AllApps, programs, programsText));
        p.Children.Add(SettingsRow("后台运行", Symbol.Setting, QuitButton(), Text("关闭窗口会留在托盘，单击图标可恢复；最小化留在任务栏。"), Text("退出会停止本次会话并释放端口。")));
    }
    private void BuildPrograms() {
        var p = Page("programs"); p.Children.Add(Text("连接器检测程序与已有登录。每个程序使用自己的模型目录与推理权限。"));
        p.Children.Add(detect); p.Children.Add(programRows); programRows.Children.Add(Card("等待检测", Text("本机服务启动后显示各程序的可用状态与原因。")));
        p.Children.Add(Text("安装或登录后，重新检测。真实推理会使用对应账户额度。"));
    }
    private void BuildPorts() {
        var p = Page("ports"); p.Children.Add(Text($"当前端口 {port}，由 AGENT_GAME_PORT 指定；未设置时使用 3211。检测同时覆盖 IPv4 与 IPv6。"));
        p.Children.Add(portNotice); p.Children.Add(scan); p.Children.Add(portSummary); p.Children.Add(listenerRows);
        var retry = Button("重新检测并启动"); retry.Click += async (_, _) => await StartAsync(); p.Children.Add(retry);
        p.Children.Add(Text("优先从原程序正常退出。强制结束只针对你确认的 PID，可能中断它的任务；清理后会重新检测，不会批量结束同名程序。"));
    }
    private void BuildAbout() {
        var p = Page("about");
        p.Children.Add(Card("同桌连接器 · Windows 64 位", versionText, Text("WinUI 3 · Windows App SDK · 自带 .NET 与 Node.js"), Text("Windows 10 2004（19041）或更新版本。Windows 11 使用系统 Mica 材质，其他环境由系统提供回退。")));
        p.Children.Add(Card("更新", updateText, update));
        var appearance = new ComboBox { Header = "外观", ItemsSource = new[] { "跟随系统", "浅色", "深色" }, SelectedIndex = 0, MinWidth = 180 };
        appearance.SelectionChanged += (_, _) => navigation.RequestedTheme = appearance.SelectedIndex switch { 1 => ElementTheme.Light, 2 => ElementTheme.Dark, _ => ElementTheme.Default };
        p.Children.Add(Card("窗口", appearance, Text("使用系统字体和原生控件。高对比度与缩放由 Windows 提供。")));
        var files = Button("打开数据文件夹"); files.Click += (_, _) => Open(data);
        p.Children.Add(Card("本机数据", Text(data), files, Text("只保存会话工作目录；游戏存档在浏览器中。")));
        p.Children.Add(Card("分发状态", Text("当前为未做 Authenticode 签名的便携包。更新会打开官方下载；下载后先退出连接器，再运行新包。"), Text("关闭此窗口不会退出。"), QuitButton()));
    }
    private Button QuitButton() { var b = Button("退出连接器"); b.Click += async (_, _) => await QuitAsync(); return b; }
    private async Task StartAsync() {
        if (busy || process is not null || configurationError is not null) return;
        busy = true; progress.Visibility = Visibility.Visible; UpdateControls();
        try {
            await InspectAsync();
            if (owners.Count > 0) {
                SetStatus("端口被占用", $"端口 {port} 有 {owners.Count} 个监听进程。请到「端口与进程」确认并清理后重试。", InfoBarSeverity.Warning);
                navigation.SelectedItem = navigation.MenuItems[2]; return;
            }
            Environment.SetEnvironmentVariable("AGENT_GAME_LAUNCHER", "1");
            Environment.SetEnvironmentVariable("AGENT_GAME_ROOT", AppContext.BaseDirectory);
            SetStatus("正在启动", "正在检测 Agent 程序与登录。请稍候。", InfoBarSeverity.Informational);
            serviceText.Text = "启动中"; browserText.Text = "等待本机服务"; lastError = "";
            var child = new JobProcess(); process = child;
            child.Output += line => DispatcherQueue.TryEnqueue(() => { if (ReferenceEquals(process, child)) Receive(line); });
            child.Exited += code => DispatcherQueue.TryEnqueue(() => {
                if (!ReferenceEquals(process, child)) return;
                process = null; running = connected = false; child.Dispose(); progress.Visibility = Visibility.Collapsed;
                serviceText.Text = "已停止"; browserText.Text = "未连接";
                SetStatus(code == 0 ? "服务已停止" : "服务启动失败", lastError.Length > 0 ? lastError : $"进程退出（代码 {code}）。可重新检测端口后启动。", code == 0 ? InfoBarSeverity.Informational : InfoBarSeverity.Error);
                UpdateControls();
            });
            child.Start(AppContext.BaseDirectory);
            navigation.SelectedItem = navigation.MenuItems[0];
        } catch (Exception e) { process?.Dispose(); process = null; SetStatus("无法启动", e.Message, InfoBarSeverity.Error); progress.Visibility = Visibility.Collapsed; }
        finally { busy = false; if (process is null) progress.Visibility = Visibility.Collapsed; UpdateControls(); }
    }
    private void Receive(string line) {
        if (!line.StartsWith("TONGZHUO_UI:")) return;
        try {
            using var json = JsonDocument.Parse(line["TONGZHUO_UI:".Length..]); var e = json.RootElement;
            switch (e.GetProperty("event").GetString()) {
                case "ready":
                    running = true; connected = false; progress.Visibility = Visibility.Collapsed;
                    serviceText.Text = "运行中"; browserText.Text = "等待网页连接";
                    SetStatus("连接器已就绪", "回到游戏网页，点击「连接本机」。", InfoBarSeverity.Success);
                    programRows.Children.Clear(); int available = 0;
                    foreach (var h in e.GetProperty("harnesses").EnumerateArray()) {
                        bool ready = h.GetProperty("available").GetBoolean(); if (ready) available++;
                        programRows.Children.Add(Card(h.GetProperty("name").GetString() ?? "Agent", Text(ready ? "可用" : "未就绪", true), Text(h.TryGetProperty("detail", out var d) ? d.GetString() ?? "" : ""), Text(h.TryGetProperty("version", out var v) ? v.GetString() ?? "" : "")));
                    }
                    programsText.Text = $"{available} 个程序可用"; UpdateControls(); break;
                case "connection":
                    connected = e.GetProperty("connected").GetBoolean(); browserText.Text = connected ? "游戏网页已连接" : "等待网页连接";
                    SetStatus(connected ? "游戏网页已连接" : "连接器已就绪", connected ? "连接器正在为此网页提供本机 Agent 服务。" : "回到游戏网页，点击「连接本机」。", InfoBarSeverity.Success); break;
                case "error": lastError = e.GetProperty("message").GetString() ?? "未知错误"; SetStatus("服务出错", lastError, InfoBarSeverity.Error); break;
            }
        } catch (JsonException) { lastError = "本机服务返回了无法读取的状态，请停止后重新启动。"; }
    }
    private async Task StopAsync() {
        if (busy) return;
        busy = true; running = connected = false; progress.Visibility = Visibility.Visible; UpdateControls();
        var child = process; process = null;
        SetStatus("正在停止", "正在结束本次连接器的会话并释放端口。", InfoBarSeverity.Informational);
        if (child is not null) await child.StopAsync();
        busy = false; progress.Visibility = Visibility.Collapsed; serviceText.Text = "已停止"; browserText.Text = "未连接";
        SetStatus("服务已停止", "可重新启动。窗口与托盘仍在运行。", InfoBarSeverity.Informational); UpdateControls();
    }
    private async Task ScanAsync() {
        if (busy) return; busy = true; UpdateControls(); portNotice.Title = "正在检测"; portNotice.Message = $"读取端口 {port} 的 IPv4 / IPv6 监听信息…";
        try { await InspectAsync(); } catch (Exception e) { portNotice.Severity = InfoBarSeverity.Error; portNotice.Title = "无法检测"; portNotice.Message = e.Message; }
        finally { busy = false; UpdateControls(); }
    }
    private async Task InspectAsync() {
        owners = await PortInspector.InspectAsync(port, process?.Pid ?? 0);
        listenerRows.Children.Clear();
        portSummary.Text = owners.Count == 0 ? "未发现监听进程。端口可尝试启动；若系统保留该端口，启动时会显示实际错误。" : $"发现 {owners.Count} 个监听进程";
        portNotice.Severity = owners.Count == 0 ? InfoBarSeverity.Success : InfoBarSeverity.Warning;
        portNotice.Title = owners.Count == 0 ? "端口空闲" : "确认占用者后再操作";
        portNotice.Message = owners.Count == 0 ? "点击「重新检测并启动」启动服务。" : "同一进程的多个监听地址已合并。其他程序不会被自动停止。";
        foreach (var owner in owners) {
            var graceful = Button(owner.Owned ? "停止本连接器服务" : "请求连接器正常退出");
            graceful.IsEnabled = owner.Owned || owner.Cooperative;
            graceful.Click += async (_, _) => {
                if (owner.Owned) await StopAsync();
                else {
                    if (await ConfirmAsync("让此连接器退出？", Describe(owner) + "\n\n将断开它的网页并停止由它启动的全部 Agent 会话。", "请求正常退出") != ContentDialogResult.Primary) return;
                    var response = await LauncherPipe.SendAsync(port, "quit", owner.Pid);
                    if (response is null) { portNotice.Title = "未能请求正常退出"; portNotice.Message = "进程可能已退出或未响应，请重新检测。"; return; }
                    await Task.Delay(800);
                }
                await ScanAsync();
            };
            var force = Button("强制结束此进程…"); force.IsEnabled = owner.StartTime is not null && owner.Pid > 4 && owner.Pid != Environment.ProcessId && !owner.Owned;
            force.Click += async (_, _) => await ForceAsync(owner);
            listenerRows.Children.Add(Card($"{owner.Name} · PID {owner.Pid}", Text(owner.Kind, true), Text(owner.Path ?? "无法获取程序路径（可能没有权限）"), Text(string.Join("\n", owner.Addresses)), Text(owner.Cooperative || owner.Owned ? "可请求正常退出。" : "未确认正常退出接口。若是旧版连接器，请先从原托盘退出；其他程序请先保存任务并在其窗口退出。"), Actions(graceful, force)));
        }
    }
    private async Task ForceAsync(PortOwner owner) {
        if (busy) return;
        if (await ConfirmAsync("强制结束这个进程？", Describe(owner) + "\n\n仅结束此 PID，不批量结束同名程序。它正在进行的任务会中断，未保存的数据可能丢失；其子进程可能仍在运行。操作前会再次核对进程身份与端口。", $"结束 PID {owner.Pid}") != ContentDialogResult.Primary) return;
        busy = true; UpdateControls(); string result;
        try { result = await PortInspector.TerminateAsync(port, owner); }
        catch (Exception e) { result = "未能结束进程：" + e.Message; }
        try { await InspectAsync(); } catch (Exception e) { result += "\n重新检测失败：" + e.Message; }
        portNotice.Title = owners.Count == 0 ? "端口已释放" : "端口仍有占用"; portNotice.Message = result + (owners.Count == 0 ? " 可重新启动连接器。" : " 请核对最新列表后重试。");
        busy = false; UpdateControls();
    }
    private static string Describe(PortOwner p) => $"{p.Name} · PID {p.Pid}\n{p.Path ?? "路径不可用"}\n{string.Join("\n", p.Addresses)}";
    private void SetStatus(string title, string message, InfoBarSeverity severity) { status.Title = title; status.Message = message; status.Severity = severity; tray?.SetText("同桌 · " + title); }
    private void UpdateControls() { start.IsEnabled = !busy && process is null && configurationError is null; stop.IsEnabled = !busy && process is not null; scan.IsEnabled = detect.IsEnabled = !busy && configurationError is null; }
    internal void Restore() { AppWindow.Show(); if (AppWindow.Presenter is OverlappedPresenter p) p.Restore(); Activate(); }
    private async Task QuitAsync() {
        if (quitting) return;
        quitting = true;
        while (busy) await Task.Delay(50);
        await StopAsync(); tray?.Dispose(); pipe?.Dispose(); Close();
    }
    private async Task<ContentDialogResult> ConfirmAsync(string title, string detail, string primary) {
        var dialog = new ContentDialog { XamlRoot = ((FrameworkElement)Content).XamlRoot, Title = title, Content = new ScrollViewer { Content = Text(detail), MaxHeight = 380 }, PrimaryButtonText = primary, CloseButtonText = "取消", DefaultButton = ContentDialogButton.Close };
        return await dialog.ShowAsync();
    }
    private async Task CheckUpdatesAsync() {
        if (checking) return; checking = true; update.IsEnabled = false; updateText.Text = "正在检查…";
        try {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(12) }; http.DefaultRequestHeaders.UserAgent.ParseAdd("TongZhuo-Connector/" + CurrentVersionText);
            using var json = JsonDocument.Parse(await http.GetStringAsync("https://api.github.com/repos/IanYet/agent-game/releases/latest"));
            var r = json.RootElement; string tag = r.GetProperty("tag_name").GetString() ?? "";
            if (r.GetProperty("draft").GetBoolean() || r.GetProperty("prerelease").GetBoolean() || !Version.TryParse(tag.TrimStart('v', 'V'), out var latest)) throw new IOException("无法识别正式版本。");
            bool hasAsset = r.GetProperty("assets").EnumerateArray().Any(a => a.GetProperty("name").GetString() == "TongZhuo-Connector-Windows-x64.exe");
            if (!hasAsset) throw new IOException("最新版本尚未提供 Windows 64 位下载包。");
            var normalized = new Version(latest.Major, latest.Minor, Math.Max(0, latest.Build), Math.Max(0, latest.Revision));
            bool available = normalized > CurrentVersion; updateText.Text = available ? $"发现新版本 {tag}。下载后先退出当前连接器，再打开新包。" : "当前已是最新正式版本。";
            updateAvailable = available; update.Content = available ? "下载新版本" : "重新检查";
        } catch (Exception e) { updateText.Text = "检查失败，可重试。" + e.Message; }
        finally { checking = false; update.IsEnabled = true; }
    }
    internal static void Open(string path) { try { Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); } catch { } }
    private static TextBlock Text(string text, bool strong = false) => new() { Text = text, TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true, FontWeight = strong ? Microsoft.UI.Text.FontWeights.SemiBold : Microsoft.UI.Text.FontWeights.Normal, Margin = new Thickness(0, 2, 0, 2) };
    private static Button Button(string label) => new() { Content = label, Margin = new Thickness(0, 4, 8, 4) };
    private static StackPanel Actions(params Button[] buttons) { var p = new StackPanel { Orientation = Orientation.Horizontal }; foreach (var b in buttons) p.Children.Add(b); return p; }
    private static Border SettingsRow(string title, Symbol symbol, FrameworkElement action, params UIElement[] detail) {
        var grid = new Grid { ColumnSpacing = 16, RowSpacing = 12 };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        var icon = new SymbolIcon(symbol) { Width = 24, Height = 24, VerticalAlignment = VerticalAlignment.Center };
        var labels = new StackPanel { Spacing = 4 }; labels.Children.Add(Text(title, true)); foreach (var item in detail) labels.Children.Add(item);
        grid.Children.Add(icon); Grid.SetColumn(labels, 1); grid.Children.Add(labels); grid.Children.Add(action);
        grid.SizeChanged += (_, _) => { bool narrow = grid.ActualWidth < 580; Grid.SetColumn(action, narrow ? 1 : 2); Grid.SetRow(action, narrow ? 1 : 0); if (action is FrameworkElement element) element.VerticalAlignment = VerticalAlignment.Center; };
        return new Border { Style = (Style)Application.Current.Resources["SettingsCard"], Child = grid };
    }
    private static Border Card(string title, params UIElement[] children) { var p = new StackPanel { Spacing = 8 }; p.Children.Add(Text(title, true)); foreach (var c in children) p.Children.Add(c); return new Border { Style = (Style)Application.Current.Resources["SettingsCard"], Child = p }; }
}
