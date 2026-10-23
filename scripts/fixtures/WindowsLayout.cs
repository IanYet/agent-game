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
                // Construct the real form, including its normal DPI/layout code.
                form.TopLevel = false; host.Controls.Add(form); host.CreateControl();
                form.Show(); Application.DoEvents();
                var fonts = new Dictionary<Control, Font>(); Fonts(form, fonts);
                form.Scale(new SizeF(scale, scale));
                foreach (var entry in fonts) entry.Key.Font = new Font(entry.Value.FontFamily, entry.Value.SizeInPoints * scale, entry.Value.Style);
                var viewport = (Panel)form.Controls[0];
                var content = (TableLayoutPanel)viewport.Controls[0];
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
                    Application.DoEvents(); content.PerformLayout(); Application.DoEvents();
                    if (scenario == "default") {
                        try { CheckScrolling(form, viewport, scale); } catch (Exception error) { Console.WriteLine("Scroll check failed: " + error.Message); Dump(viewport, ""); Environment.Exit(1); }
                        // WinForms constrains even child Forms to the virtual
                        // desktop size. Render the SAME content controls in an
                        // unconstrained panel so 200% images contain every row.
                        viewport.Controls.Remove(content); host.Controls.Add(content);
                        content.Dock = DockStyle.None;
                        int width = (int)(504 * scale);
                        content.MinimumSize = new Size(width, 0); content.MaximumSize = new Size(width, 0);
                    }
                    for (int pass = 0; pass < 3; pass++) {
                        content.Size = new Size(content.MinimumSize.Width, content.GetPreferredSize(new Size(content.MinimumSize.Width, 0)).Height);
                        content.PerformLayout(); Application.DoEvents();
                    }
                    using (var bitmap = new Bitmap(content.Width, content.Height)) {
                        content.DrawToBitmap(bitmap, new Rectangle(Point.Empty, bitmap.Size));
                        bitmap.Save(Path.Combine(args[0], scenario + "-" + (int)(scale * 100) + ".png"), ImageFormat.Png);
                    }
                    Console.WriteLine("Checking " + scenario + " at " + (int)(scale * 100) + "%: " + content.Size);
                    try { Check(content, content); } catch { Dump(content, ""); throw; }
                }
            }
        }
        Console.WriteLine("PASS: Windows layout at 100%, 150%, 200% with long Chinese status/error/update text. No connector process started.");
    }
    private static void Check(Control parent, Control viewport) {
        foreach (Control control in parent.Controls) {
            if (control is Label || control is Button) {
                Size preferred = control.GetPreferredSize(new Size(control.Width, 0));
                if (preferred.Height > control.Height + 2) throw new Exception("Clipped text: " + control.Text);
                if (control.Right > parent.ClientSize.Width - parent.Padding.Right + 2) throw new Exception("Text outside column: " + control.Text);
                VisibleBounds(control, viewport);
            }
            Check(control, viewport);
        }
    }
    private static void VisibleBounds(Control control, Control viewport) {
        var visible = new Rectangle(viewport.PointToClient(control.PointToScreen(Point.Empty)), control.Size);
        if (!viewport.ClientRectangle.Contains(visible)) throw new Exception("Control outside visible area: " + control.Text);
    }
    private static void CheckScrolling(Form form, Panel content, float scale) {
        form.AutoSize = false; form.MinimumSize = new Size(1, 1); form.Size = new Size((int)(520 * scale), (int)(380 * scale));
        Application.DoEvents(); content.AutoScrollPosition = new Point(0, 100000); Application.DoEvents();
        CheckExit(content, content); content.AutoScrollPosition = Point.Empty; Application.DoEvents();
        Console.WriteLine("PASS: exit/minimize buttons reachable by scrolling in a short window at " + (int)(scale * 100) + "%.");
    }
    private static void CheckExit(Control parent, Control viewport) {
        foreach (Control control in parent.Controls) {
            if (control is Button && (control.Text == "退出连接器" || control.Text == "缩到托盘")) VisibleBounds(control, viewport);
            CheckExit(control, viewport);
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
