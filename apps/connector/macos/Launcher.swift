import AppKit
import SwiftUI
import Foundation
import Darwin

enum ConnectorPage: String, CaseIterable, Identifiable {
    case overview = "概览", programs = "可用程序", ports = "端口与进程", about = "关于与更新"
    var id: String { rawValue }
    var symbol: String { switch self { case .overview: return "house"; case .programs: return "square.grid.2x2"; case .ports: return "network"; case .about: return "info.circle" } }
}
struct Harness: Identifiable, Decodable {
    let id: String, name: String, available: Bool
    let detail: String?
    let version: String?
}
private struct LauncherEvent: Decodable {
    let event: String
    let pid: Int32?
    let connected: Bool?
    let message: String?
    let harnesses: [Harness]?
}
private final class Child {
    let guardian = Process(), lease = Pipe(), output = Pipe()
    var pending = Data()
}

@MainActor final class ConnectorModel: ObservableObject {
    static let shared = ConnectorModel()
    static let gameURL = URL(string: "https://ianyet.github.io/agent-game/")!
    static let releaseURL = URL(string: "https://github.com/IanYet/agent-game/releases/latest")!
    @Published var page: ConnectorPage? = .overview
    @Published var status = "正在准备"
    @Published var detail = ""
    @Published var running = false
    @Published var connected = false
    @Published var busy = false
    @Published var servicePresent = false
    @Published var harnesses: [Harness] = []
    @Published var owners: [PortOwner] = []
    @Published var portMessage = "点击重新检测，查看 IPv4 / IPv6 监听进程。"
    @Published var updateMessage = "手动检查 GitHub 正式发行版。"
    @Published var checkingUpdate = false
    @Published var updateAvailable = false
    @Published var confirmation: PortOwner?
    @Published var confirmForce = false
    let port: Int, configurationError: String?, dataURL: URL
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "未知"
    var showWindow: (() -> Void)?
    private var child: Child?, initialized = false, quitting = false
    private var ownedPid: Int32 = 0
    private var log: FileHandle?
    private var signals: [DispatchSourceSignal] = []

    private init() {
        let environment = ProcessInfo.processInfo.environment
        let rawPort = environment["AGENT_GAME_PORT"] ?? "3211"
        if let value = Int(rawPort), (1024...65535).contains(value) { port = value; configurationError = nil }
        else { port = 3211; configurationError = "AGENT_GAME_PORT「\(rawPort)」无效。请改为 1024–65535 的整数后重新打开。" }
        dataURL = environment["AGENT_GAME_DATA_DIR"].map { URL(fileURLWithPath: $0) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/AgentArcade")
    }
    func initialize() async {
        guard !initialized else { return }; initialized = true
        do {
            try FileManager.default.createDirectory(at: dataURL, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let logs = ProcessInfo.processInfo.environment["AGENT_GAME_DATA_DIR"] != nil ? dataURL.appendingPathComponent("logs") : FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/AgentArcade")
            try FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
            let path = logs.appendingPathComponent("connector.log")
            FileManager.default.createFile(atPath: path.path, contents: nil, attributes: [.posixPermissions: 0o600])
            log = try FileHandle(forWritingTo: path)
            for number in [SIGTERM, SIGINT, SIGHUP] {
                signal(number, SIG_IGN)
                let source = DispatchSource.makeSignalSource(signal: number, queue: .main)
                source.setEventHandler { NSApplication.shared.terminate(nil) }; source.resume(); signals.append(source)
            }
            if let error = configurationError { status = "无法启动"; detail = error; return }
            if UserDefaults.standard.object(forKey: "startServiceOnLaunch") as? Bool ?? true { await start() }
            else { status = "服务已停止"; detail = "点击「启动连接器」开始。" }
        } catch { status = "无法准备运行目录"; detail = error.localizedDescription }
    }
    func start() async {
        guard !busy, child == nil, configurationError == nil, !quitting else { return }
        busy = true; status = "正在检测端口"; detail = "正在读取监听信息。"
        defer { busy = false }
        do {
            owners = try await PortInspector.inspect(port: port, ownedPid: 0)
            guard !quitting else { return }
            if !owners.isEmpty { status = "端口被占用"; detail = "请确认占用者，正常退出或清理后重试。"; page = .ports; portMessage = "端口 \(port) 有 \(owners.count) 个监听进程。"; return }
            guard let resources = Bundle.main.resourceURL, let executable = Bundle.main.executableURL else { throw PortInspector.failure("应用缺少运行资源，请重新下载完整 ZIP。") }
            let next = Child()
            next.guardian.executableURL = executable.deletingLastPathComponent().appendingPathComponent("ConnectorGuardian")
            next.guardian.arguments = [dataURL.appendingPathComponent("connector-\(port).lock").path, resources.appendingPathComponent("runtime/node").path, resources.appendingPathComponent("dist/connector/index.cjs").path]
            next.guardian.currentDirectoryURL = resources
            var environment = ProcessInfo.processInfo.environment
            environment["AGENT_GAME_ROOT"] = resources.path; environment["AGENT_GAME_DATA_DIR"] = dataURL.path; environment["AGENT_GAME_LAUNCHER"] = "1"
            let config = dataURL.appendingPathComponent("connector.config.json")
            if environment["AGENT_GAME_CONFIG"] == nil && FileManager.default.fileExists(atPath: config.path) { environment["AGENT_GAME_CONFIG"] = config.path }
            next.guardian.environment = environment; next.guardian.standardInput = next.lease
            next.guardian.standardOutput = next.output; next.guardian.standardError = next.output
            _ = fcntl(next.lease.fileHandleForWriting.fileDescriptor, F_SETFD, FD_CLOEXEC)
            next.output.fileHandleForReading.readabilityHandler = { [weak self, weak next] handle in
                let bytes = handle.availableData
                if bytes.isEmpty { handle.readabilityHandler = nil; return }
                Task { @MainActor in if let next = next { self?.receive(bytes, from: next) } }
            }
            next.guardian.terminationHandler = { [weak self, weak next] process in
                let code = process.terminationStatus
                Task { @MainActor in
                    guard let self = self, let next = next, self.child === next else { return }
                    self.child = nil; self.servicePresent = false; self.ownedPid = 0; self.running = false; self.connected = false
                    self.status = code == 0 ? "服务已停止" : code == 73 ? "此端口的连接器已在运行" : "服务启动失败"
                    if code == 73 { self.detail = "请重新检测端口，从原连接器的窗口或菜单栏正常退出。" }
                    else if code != 0 && self.detail.isEmpty { self.detail = "退出代码 \(code)。请重新检测端口后启动。" }
                }
            }
            child = next; servicePresent = true
            do { try next.guardian.run() }
            catch { child = nil; servicePresent = false; next.output.fileHandleForReading.readabilityHandler = nil; throw error }
            try next.lease.fileHandleForReading.close(); try next.output.fileHandleForWriting.close()
            status = "正在启动"; detail = "正在检测 Agent 程序和已有登录。请稍候。"
            page = .overview
        } catch { status = "无法启动"; detail = error.localizedDescription }
    }
    private func receive(_ bytes: Data, from source: Child) {
        guard child === source else { return }
        if let log = log, (try? log.offset()) ?? 0 < 1024 * 1024 { try? log.write(contentsOf: bytes) }
        source.pending.append(bytes)
        while let newline = source.pending.firstIndex(of: 10) {
            let line = source.pending.prefix(upTo: newline); source.pending.removeSubrange(...newline)
            let prefix = Data("TONGZHUO_UI:".utf8)
            guard line.starts(with: prefix), let e = try? JSONDecoder().decode(LauncherEvent.self, from: Data(line.dropFirst(prefix.count))) else { continue }
            switch e.event {
            case "spawned": ownedPid = e.pid ?? 0
            case "ready":
                ownedPid = e.pid ?? ownedPid; running = true; connected = false; harnesses = e.harnesses ?? []
                status = "连接器已就绪"; detail = "回到游戏网页，点击「连接本机」。"
            case "connection":
                connected = e.connected ?? false; status = connected ? "游戏网页已连接" : "连接器已就绪"
                detail = connected ? "正在为此网页提供本机 Agent 服务。" : "回到游戏网页，点击「连接本机」。"
            case "error": status = "服务出错"; detail = e.message ?? "未知错误"
            default: break
            }
        }
        if source.pending.count > 256 * 1024 { source.pending.removeAll(); detail = "服务状态过长，请停止后重新启动。" }
    }
    @discardableResult func stop() async -> Bool {
        guard !busy else { return false }
        busy = true; defer { busy = false }
        guard let current = child else { servicePresent = false; running = false; connected = false; status = "服务已停止"; return true }
        status = "正在停止"; detail = "正在结束本次连接器的会话并释放端口。"
        try? current.lease.fileHandleForWriting.close()
        let exited = await Task.detached {
            for _ in 0..<120 { if !current.guardian.isRunning { return true }; try? await Task.sleep(nanoseconds: 50_000_000) }
            return !current.guardian.isRunning
        }.value
        guard exited else { status = "仍在等待服务退出"; detail = "尚未确认释放端口，请稍候后重试停止。"; return false }
        current.output.fileHandleForReading.readabilityHandler = nil
        if child === current { child = nil }
        ownedPid = 0; servicePresent = false; running = false; connected = false; status = "服务已停止"; detail = "可重新启动，窗口和菜单栏仍在运行。"; return true
    }
    func shutdown() async -> Bool {
        quitting = true
        while busy { try? await Task.sleep(nanoseconds: 50_000_000) }
        let stopped = await stop()
        if stopped { try? log?.close() } else { quitting = false }
        return stopped
    }
    func scan() async {
        guard !busy else { return }; busy = true; portMessage = "正在检测 IPv4 / IPv6 监听信息…"
        defer { busy = false }
        do { owners = try await PortInspector.inspect(port: port, ownedPid: ownedPid); portMessage = owners.isEmpty ? "未发现监听进程。可重新检测并启动；启动时会检查系统是否允许绑定。" : "发现 \(owners.count) 个监听进程。同一进程的多个地址已合并。" }
        catch { portMessage = "检测失败：\(error.localizedDescription)。请重试。" }
    }
    func actOnConfirmedOwner(_ owner: PortOwner, force: Bool) async {
        guard !busy else { return }; confirmation = nil
        busy = true
        var result: String
        do {
            if force { result = try await PortInspector.terminate(port: port, expected: owner) }
            else if owner.owned { busy = false; _ = await stop(); await scan(); return }
            else if let app = owner.application, ProcessIdentity.read(app.pid)?.birth == app.birth, let application = NSRunningApplication(processIdentifier: app.pid), application.bundleIdentifier == "io.github.ianyet.agent-game.connector" {
                let latest = try await PortInspector.inspect(port: port, ownedPid: ownedPid)
                guard latest.contains(where: { $0.pid == owner.pid && $0.identity?.birth == owner.identity?.birth && $0.application?.birth == app.birth }), ProcessIdentity.read(app.pid)?.birth == app.birth else { busy = false; await scan(); portMessage = "目标已经变化，未请求退出。请核对最新列表。"; return }
                result = application.terminate() ? "已请求连接器正常退出。若它正在退出，请稍候后重新检测。" : "连接器未接受退出请求。请从原菜单栏退出后重新检测。"
                try? await Task.sleep(nanoseconds: 900_000_000)
            } else { result = "无法确认原连接器应用。请从原窗口或菜单栏退出后重新检测。" }
            owners = try await PortInspector.inspect(port: port, ownedPid: ownedPid)
            portMessage = result + (owners.isEmpty ? " 端口已释放，可重新启动。" : " 端口仍有占用，请查看最新列表。")
        } catch { portMessage = "操作未完成：\(error.localizedDescription)。请重新检测。" }
        busy = false
    }
    func request(_ owner: PortOwner, force: Bool) { confirmation = owner; confirmForce = force }
    func checkUpdate() async {
        guard !checkingUpdate else { return }; checkingUpdate = true; updateMessage = "正在检查…"; defer { checkingUpdate = false }
        do {
            var request = URLRequest(url: URL(string: "https://api.github.com/repos/IanYet/agent-game/releases/latest")!); request.timeoutInterval = 12
            request.setValue("TongZhuo-Connector/\(version)", forHTTPHeaderField: "User-Agent")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200, let release = try JSONSerialization.jsonObject(with: data) as? [String: Any], release["draft"] as? Bool == false, release["prerelease"] as? Bool == false, let tag = release["tag_name"] as? String else { throw PortInspector.failure("无法读取正式发行版。") }
            #if arch(arm64)
            let assetName = "TongZhuo-Connector-macOS-Apple-Silicon.zip"
            #else
            let assetName = "TongZhuo-Connector-macOS-Intel.zip"
            #endif
            guard let assets = release["assets"] as? [[String: Any]], assets.contains(where: { $0["name"] as? String == assetName }) else { throw PortInspector.failure("最新版本尚未提供此芯片的下载包。") }
            let latest = tag.trimmingCharacters(in: CharacterSet(charactersIn: "vV"))
            guard latest.split(separator: ".").count == 3, latest.split(separator: ".").allSatisfy({ Int($0) != nil }) else { throw PortInspector.failure("版本号无法识别。") }
            updateAvailable = latest.compare(version, options: .numeric) == .orderedDescending
            updateMessage = updateAvailable ? "发现 \(tag)。下载后先退出当前应用，再用新应用替换。" : "当前已是最新正式版本。"
        } catch { updateMessage = "检查失败，可重试。\(error.localizedDescription)" }
    }
}

@MainActor struct ConnectorView: View {
    @ObservedObject var model: ConnectorModel
    @Environment(\.openWindow) private var openWindow
    @State private var restartConfirmation = false
    var body: some View {
        NavigationSplitView {
            List(ConnectorPage.allCases, selection: $model.page) { page in Label(page.rawValue, systemImage: page.symbol).tag(page) }
                .listStyle(.sidebar).navigationSplitViewColumnWidth(min: 170, ideal: 200)
        } detail: {
            Form {
                switch model.page ?? .overview {
                case .overview: overview
                case .programs: programs
                case .ports: ports
                case .about: about
                }
            }.formStyle(.grouped).navigationTitle((model.page ?? .overview).rawValue)
        }
        .toolbar {
            ToolbarItem { Button { model.page = .ports; Task { await model.scan() } } label: { Label("检测端口", systemImage: "arrow.clockwise") }.disabled(model.busy).help("重新读取端口的 IPv4 与 IPv6 监听进程") }
            ToolbarItem(placement: .primaryAction) { Button { NSWorkspace.shared.open(ConnectorModel.gameURL) } label: { Label("打开游戏网页", systemImage: "arrow.up.right") } }
        }
        .frame(minWidth: 720, minHeight: 520)
        .textSelection(.enabled)
        .task { model.showWindow = { openWindow(id: "connector"); NSApp.activate(ignoringOtherApps: true) }; await model.initialize() }
        .alert(model.confirmForce ? "强制结束这个进程？" : "请求此连接器退出？", isPresented: Binding(get: { model.confirmation != nil }, set: { if !$0 { model.confirmation = nil } }), presenting: model.confirmation) { owner in
            Button("取消", role: .cancel) { model.confirmation = nil }
            Button(model.confirmForce ? "结束 PID \(owner.pid)" : "请求正常退出", role: .destructive) { let force = model.confirmForce; Task { await model.actOnConfirmedOwner(owner, force: force) } }
        } message: { owner in
            Text(owner.description + (model.confirmForce ? "\n\n仅结束此 PID，不批量结束同名程序。正在进行的任务会中断，未保存的数据可能丢失；子进程可能仍在运行。操作前将再次核对身份与端口。" : "\n\n将断开它的游戏网页，停止它启动的全部 Agent 会话，并释放端口。"))
        }
        .alert("重新检测可用程序？", isPresented: $restartConfirmation) {
            Button("取消", role: .cancel) { }
            Button("重启并检测", role: .destructive) { Task { if await model.stop() { await model.start() } } }
        } message: { Text("这会重启服务，断开网页并停止本次连接器的 Agent 会话。请先暂停牌局。") }
    }
    private var overview: some View {
        Group {
            Section {
                LabeledContent("服务状态", value: model.status)
                Text(model.detail).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if model.busy || (model.servicePresent && !model.running) { ProgressView().controlSize(.small) }
                LabeledContent("本机地址", value: "127.0.0.1:\(model.port)")
                HStack { Button("启动连接器") { Task { await model.start() } }.disabled(model.busy || model.servicePresent || model.configurationError != nil)
                    Button("停止服务") { Task { await model.stop() } }.disabled(model.busy || !model.servicePresent) }
            } header: { Label("本机服务", systemImage: "desktopcomputer") }
            Section("游戏网页") { LabeledContent("连接状态", value: model.connected ? "游戏网页已连接" : "等待网页连接"); Text("启动服务后，在网页点击「连接本机」。").foregroundStyle(.secondary) }
            Section("Agent 程序") { LabeledContent("可用程序", value: "\(model.harnesses.filter(\.available).count) 个"); Button("查看检测结果") { model.page = .programs } }
            Section("后台运行") {
                Text("关闭窗口后仍在菜单栏运行；最小化留在程序坞。可从菜单栏「打开连接器」或程序坞恢复窗口。")
                Text("「停止服务」停止本次会话并释放端口；「退出连接器」同时退出应用。也可按 ⌘Q 退出。").foregroundStyle(.secondary)
                Button("退出连接器") { NSApp.terminate(nil) }.disabled(model.busy)
            }
        }
    }
    private var programs: some View {
        Group {
            Section { Text("各程序使用自己的登录与模型目录。检测到模型不代表有推理权限，真实推理会使用对应账户额度。")
                Button("重新检测程序") { if model.servicePresent { restartConfirmation = true } else { Task { await model.start() } } }.disabled(model.busy || model.configurationError != nil)
            }
            if model.harnesses.isEmpty { Section { Text("本机服务启动后显示各程序的检测结果与原因。").foregroundStyle(.secondary) } }
            ForEach(model.harnesses) { harness in
                Section(harness.name) { Label(harness.available ? "可用" : "未就绪", systemImage: harness.available ? "checkmark.circle" : "exclamationmark.circle")
                    Text(harness.detail ?? "").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    if let version = harness.version { Text(version).font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
    }
    private var ports: some View {
        Group {
            Section("端口 \(model.port)") {
                Text("默认 3211；设置 AGENT_GAME_PORT 后使用指定值。检测包含 IPv4 与 IPv6。")
                Text(model.portMessage).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                HStack { Button("重新检测") { Task { await model.scan() } }; Button("重新检测并启动") { Task { await model.start() } }.disabled(model.servicePresent || model.configurationError != nil) }.disabled(model.busy)
                if model.busy { ProgressView().controlSize(.small) }
            }
            ForEach(model.owners) { owner in
                Section("\(owner.name) · PID \(owner.pid)") {
                    Text(owner.kind).fontWeight(.semibold)
                    Text(owner.identity?.path.isEmpty == false ? owner.identity!.path : "无法获取程序路径（可能没有权限）").font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    ForEach(owner.addresses, id: \.self) { Text($0).monospaced() }
                    if !owner.owned && owner.application == nil { Text("未确认正常退出接口。旧版连接器请先从原菜单栏退出；其他程序请保存任务并从其窗口退出。").foregroundStyle(.secondary) }
                    HStack {
                        Button(owner.owned ? "停止本连接器服务" : "请求连接器正常退出") { model.request(owner, force: false) }.disabled(!owner.owned && owner.application == nil)
                        Button("强制结束此进程…", role: .destructive) { model.request(owner, force: true) }.disabled(owner.owned || owner.identity == nil || owner.pid <= 1 || owner.pid == getpid())
                    }.disabled(model.busy)
                }
            }
            Section { Text("未知占用程序不会被自动结束。每次结束后都会重新检测；端口再次被占用时，需确认新列表再操作。").foregroundStyle(.secondary) }
        }
    }
    private var about: some View {
        Group {
            Section("同桌连接器") {
                LabeledContent("版本", value: "v\(model.version)")
                Text("SwiftUI 原生窗口与菜单栏 · 自带 Node.js · macOS 13.5 或更新版本").foregroundStyle(.secondary)
                Text("关闭窗口继续后台运行，⌘Q 完整退出。")
            }
            Section("更新") {
                Text(model.updateMessage)
                HStack { Button("检查更新") { Task { await model.checkUpdate() } }.disabled(model.checkingUpdate)
                    if model.updateAvailable { Link("下载新版本", destination: ConnectorModel.releaseURL) }
                    if model.checkingUpdate { ProgressView().controlSize(.small) }
                }
            }
            Section("本机数据") { Text(model.dataURL.path).foregroundStyle(.secondary); Button("打开数据文件夹") { NSWorkspace.shared.open(model.dataURL) } }
            Section("分发状态") {
                Text("当前为 ad-hoc 本地签名；没有 Developer ID 身份签名，未经过 Apple 公证。ad-hoc 不表示 Apple 已审核或认证应用。")
                Link("Apple：在 Mac 上安全地打开 App", destination: URL(string: "https://support.apple.com/zh-cn/102445")!)
            }
        }
    }
}

@MainActor final class ApplicationDelegate: NSObject, NSApplicationDelegate {
    private var terminationPending = false
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { ConnectorModel.shared.showWindow?(); return true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !terminationPending else { return .terminateLater }; terminationPending = true
        Task { let stopped = await ConnectorModel.shared.shutdown(); terminationPending = false; sender.reply(toApplicationShouldTerminate: stopped) }; return .terminateLater
    }
}

@main @MainActor struct TongZhuoConnectorApp: App {
    @NSApplicationDelegateAdaptor(ApplicationDelegate.self) private var delegate
    @StateObject private var model = ConnectorModel.shared
    @AppStorage("startServiceOnLaunch") private var startOnLaunch = true
    var body: some Scene {
        Window("同桌连接器", id: "connector") { ConnectorView(model: model) }.defaultSize(width: 960, height: 720)
            .commands { CommandGroup(after: .newItem) { Button("打开连接器") { model.showWindow?() }.keyboardShortcut("1") } }
        Settings {
            Form {
                Toggle("打开应用时启动本机服务", isOn: $startOnLaunch)
                Text("关闭窗口后仍可从菜单栏恢复；退出连接器会停止本次服务与 Agent 会话。外观跟随系统。").foregroundStyle(.secondary)
                LabeledContent("当前端口", value: "\(model.port)（AGENT_GAME_PORT）")
            }.formStyle(.grouped).frame(width: 440).padding()
        }
        MenuBarExtra {
            Text("同桌连接器 v\(model.version)"); Text(model.status)
            Divider()
            Button("打开连接器") { model.showWindow?() }.keyboardShortcut("1")
            Button("打开游戏网页") { NSWorkspace.shared.open(ConnectorModel.gameURL) }
            Button("端口与进程…") { model.showWindow?(); model.page = .ports; Task { await model.scan() } }
            Divider()
            Button("退出连接器") { NSApp.terminate(nil) }.keyboardShortcut("q")
        } label: {
            Image(nsImage: Self.menuIcon).accessibilityLabel("同桌连接器")
        }
    }
    private static let menuIcon: NSImage = {
        let image = NSImage(size: NSSize(width: 18, height: 18))
        for name in ["MenuIcon", "MenuIcon@2x", "MenuIcon@3x"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "png"), let bytes = try? Data(contentsOf: url), let representation = NSBitmapImageRep(data: bytes) {
                representation.size = NSSize(width: 18, height: 18); image.addRepresentation(representation)
            }
        }
        if image.representations.isEmpty { return NSImage(systemSymbolName: "link", accessibilityDescription: "同桌连接器")! }
        image.size = NSSize(width: 18, height: 18); image.isTemplate = true; return image
    }()
}
