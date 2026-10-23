using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using AgentArcade;

internal static class WindowsLayout {
    [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    private static T Field<T>(object target, string name) {
        return (T)target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(target);
    }
    [STAThread]
    private static void Main(string[] args) {
        // Render from a consistent 96-DPI base, then scale geometry AND fonts.
        // This changes only this test thread, never the user's display settings.
        SetThreadDpiAwarenessContext(new IntPtr(-1));
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        Directory.CreateDirectory(args[0]);
        foreach (float scale in new float[] {1F, 1.5F, 2F}) {
            using (var host = new Panel { Size = new Size(4096, 4096) })
            using (var form = new ConnectorWindow("", 3211, true)) {
                // A child form renders the actual native controls/chrome without
                // Windows clamping its size to the runner's 1024x768 desktop.
                form.TopLevel = false; host.Controls.Add(form); host.CreateControl();
                form.Show(); Application.DoEvents();
                var fonts = new Dictionary<Control, Font>(); Fonts(form, fonts);
                form.Scale(new SizeF(scale, scale));
                foreach (var entry in fonts) entry.Key.Font = new Font(entry.Value.FontFamily, entry.Value.SizeInPoints * scale, entry.Value.Style);
                foreach (string scenario in new string[] {"default", "ready", "connected", "error"}) {
                    Field<Label>(form, "status").Text = scenario == "ready" || scenario == "default" ? "●  已就绪，等待网页连接" : scenario == "connected" ? "●  游戏网页已连接" : "连接器启动失败";
                    Field<Label>(form, "account").Text = "Harness：Codex · ACP、Codex · App Server、dsh · DeepSeek Harness、WorkBuddy";
                    Field<Label>(form, "detail").Text = scenario == "error" ? "连接器启动失败：无法启动所选 Harness。请检查是否已安装并登录；可在游戏网页查看完整检测信息，确认配置后退出连接器并重新启动。" : "回到网页连接本机。最小化或关闭窗口会留在托盘，选择「退出连接器」会停止所有玩家并释放本机端口。";
                    Field<Label>(form, "version").Text = "当前 v" + UpdateChecker.CurrentVersionText + " · 发现 v100.200.300，请下载更新后退出当前连接器";
                    Field<Button>(form, "update").Text = "下载更新";
                    if (scenario == "default") {
                        Field<Label>(form, "account").Text = "Harness：Codex · ACP、dsh、WorkBuddy";
                        Field<Label>(form, "version").Text = "当前版本 v" + UpdateChecker.CurrentVersionText;
                        Field<Button>(form, "update").Text = "检查更新";
                    }
                    Application.DoEvents(); form.PerformLayout(); Application.DoEvents();
                    // Hosted runners often have a 1024x768 virtual desktop.
                    // A 200% preview is larger than that desktop; explicitly
                    // allow the off-screen render to grow to its content size.
                    // The product keeps scrolling available on small displays.
                    for (int pass = 0; pass < 2; pass++) {
                        Control root = form.Controls[0];
                        Size needed = root.GetPreferredSize(new Size(root.Width, 0));
                        form.MinimumSize = new Size((int)(520 * scale), needed.Height + form.Height - form.ClientSize.Height);
                        form.PerformLayout(); Application.DoEvents();
                    }
                    if (scale == 1F && scenario == "ready" && Environment.GetEnvironmentVariable("LAYOUT_DEBUG") == "1") Dump(form, "");
                    using (var bitmap = new Bitmap(form.Width, form.Height)) {
                        form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, bitmap.Size));
                        bitmap.Save(Path.Combine(args[0], scenario + "-" + (int)(scale * 100) + ".png"), ImageFormat.Png);
                    }
                    Console.WriteLine("Checking " + scenario + " at " + (int)(scale * 100) + "%: " + form.Size);
                    try { Check(form); } catch { Dump(form, ""); throw; }
                }
            }
        }
        Console.WriteLine("PASS: Windows layout at 100%, 150%, 200% with long Chinese status/error/update text. No connector process started.");
    }
    private static void Check(Control parent) {
        foreach (Control control in parent.Controls) {
            if (control is Label || control is Button) {
                Size preferred = control.GetPreferredSize(new Size(control.Width, 0));
                if (preferred.Height > control.Height + 2) throw new Exception("Clipped text: " + control.Text);
                if (control.Right > parent.ClientSize.Width - parent.Padding.Right + 2) throw new Exception("Text outside column: " + control.Text);
                var form = control.FindForm();
                var visible = new Rectangle(form.PointToClient(control.PointToScreen(Point.Empty)), control.Size);
                if (!form.ClientRectangle.Contains(visible)) throw new Exception("Control outside visible window: " + control.Text);
            }
            Check(control);
        }
    }
    private static void Fonts(Control control, Dictionary<Control, Font> fonts) {
        fonts.Add(control, control.Font); foreach (Control child in control.Controls) Fonts(child, fonts);
    }
    private static void Dump(Control parent, string indent) {
        Console.WriteLine(indent + parent.GetType().Name + " " + parent.Bounds + " margin=" + parent.Margin + " padding=" + parent.Padding + " preferred=" + parent.PreferredSize + " " + parent.Text);
        var table = parent as TableLayoutPanel;
        if (table != null) { Console.WriteLine(indent + "rows=" + String.Join(",", table.GetRowHeights())); foreach (RowStyle row in table.RowStyles) Console.WriteLine(indent + row.SizeType + " " + row.Height); }
        foreach (Control child in parent.Controls) Dump(child, indent + " ");
    }
}
