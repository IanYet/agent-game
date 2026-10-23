import AppKit
import Foundation
import Darwin

final class Connector: NSObject, NSApplicationDelegate {
    private let guardian = Process()
    private let lease = Pipe()
    private let output = Pipe()
    private var log: FileHandle?
    private var item: NSStatusItem?
    private let status = NSMenuItem(title: "正在启动…", action: nil, keyEquivalent: "")
    private var stopping = false
    private var pending = ""
    private let headless = CommandLine.arguments.contains("--headless")
    private var signals: [DispatchSourceSignal] = []

    func applicationDidFinishLaunching(_ notification: Notification) { start() }

    func start() {
        do {
            let environment = ProcessInfo.processInfo.environment
            let rawPort = environment["AGENT_GAME_PORT"] ?? "3211"
            guard let port = Int(rawPort), (1024...65535).contains(port) else {
                throw NSError(domain: "AGENT_GAME_PORT 必须是 1024–65535 的端口", code: 2)
            }
            guard let resources = Bundle.main.resourceURL else { throw NSError(domain: "应用包缺少 Resources", code: 1) }
            let data = environment["AGENT_GAME_DATA_DIR"].map { URL(fileURLWithPath: $0) }
                ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/AgentArcade")
            try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            if !headless {
                let logs = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/AgentArcade")
                try FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
                let url = logs.appendingPathComponent("connector.log")
                // One bounded log per launch; never record tokens or raw RPC data.
                FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.posixPermissions: 0o600])
                log = try FileHandle(forWritingTo: url)
                makeMenu(port: port, data: data)
            }
            guardian.executableURL = Bundle.main.executableURL!.deletingLastPathComponent().appendingPathComponent("ConnectorGuardian")
            guardian.arguments = [data.appendingPathComponent("connector-\(port).lock").path,
                                  resources.appendingPathComponent("runtime/node").path,
                                  resources.appendingPathComponent("dist/connector/index.cjs").path]
            guardian.currentDirectoryURL = resources
            var childEnvironment = environment
            childEnvironment["AGENT_GAME_ROOT"] = resources.path
            childEnvironment["AGENT_GAME_DATA_DIR"] = data.path
            // Config lives outside the signed/read-only bundle and survives upgrades.
            let config = data.appendingPathComponent("connector.config.json")
            if FileManager.default.fileExists(atPath: config.path) { childEnvironment["AGENT_GAME_CONFIG"] = config.path }
            guardian.environment = childEnvironment
            guardian.standardInput = lease
            guardian.standardOutput = output
            guardian.standardError = output
            _ = fcntl(lease.fileHandleForWriting.fileDescriptor, F_SETFD, FD_CLOEXEC)
            output.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let bytes = handle.availableData
                if bytes.isEmpty { handle.readabilityHandler = nil; return }
                DispatchQueue.main.async { self?.receive(bytes) }
            }
            guardian.terminationHandler = { [weak self] process in
                DispatchQueue.main.async {
                    guard let self = self, !self.stopping else { return }
                    self.status.title = process.terminationStatus == 73 ? "连接器已在运行" : "连接器已停止，请退出后重试"
                    if self.headless { exit(process.terminationStatus) }
                }
            }
            try guardian.run()
            // Only the launcher's writer remains open. SIGKILL therefore means EOF.
            try lease.fileHandleForReading.close()
            try output.fileHandleForWriting.close()
            for number in [SIGTERM, SIGINT, SIGHUP] {
                signal(number, SIG_IGN)
                let source = DispatchSource.makeSignalSource(signal: number, queue: .main)
                source.setEventHandler { [weak self] in self?.quit() }
                source.resume(); signals.append(source)
            }
            if let argument = CommandLine.arguments.first(where: { $0.hasPrefix("--exit-after-ms=") }),
               let ms = Double(argument.dropFirst("--exit-after-ms=".count)), ms > 0 {
                DispatchQueue.main.asyncAfter(deadline: .now() + ms / 1000) { [weak self] in self?.quit() }
            }
        } catch {
            fputs("连接器启动失败：\(error.localizedDescription)\n", stderr)
            stop()
            if !headless {
                let alert = NSAlert(); alert.messageText = "连接器启动失败"; alert.informativeText = error.localizedDescription
                alert.runModal()
            }
            exit(1)
        }
    }

    private func makeMenu(port: Int, data: URL) {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item?.button?.title = "同桌"
        if let url = Bundle.main.url(forResource: "Connector", withExtension: "icns"), let icon = NSImage(contentsOf: url) {
            icon.size = NSSize(width: 18, height: 18); item?.button?.image = icon; item?.button?.imagePosition = .imageLeading
        }
        item?.button?.toolTip = "同桌 · 本地连接器"
        let menu = NSMenu()
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "未知"
        menu.addItem(withTitle: "同桌 · 本地连接器 v\(version)", action: nil, keyEquivalent: "")
        menu.addItem(status)
        menu.addItem(withTitle: "127.0.0.1:\(port)", action: nil, keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "打开游戏网页", action: #selector(openGame), keyEquivalent: "").target = self
        menu.addItem(withTitle: "打开数据文件夹", action: #selector(openData), keyEquivalent: "").target = self
        menu.addItem(withTitle: "下载与版本说明", action: #selector(openRelease), keyEquivalent: "").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "退出连接器", action: #selector(quit), keyEquivalent: "q").target = self
        item?.menu = menu
    }

    private func receive(_ bytes: Data) {
        if headless { FileHandle.standardOutput.write(bytes) }
        if let log = log, (try? log.offset()) ?? 0 < 1024 * 1024 { try? log.write(contentsOf: bytes) }
        pending += String(decoding: bytes, as: UTF8.self)
        while let newline = pending.firstIndex(of: "\n") {
            let line = String(pending[..<newline]); pending.removeSubrange(...newline)
            if line == "AGENT_ARCADE_STATUS:ready" { status.title = "已就绪，等待网页连接" }
            else if line == "AGENT_ARCADE_STATUS:connected" { status.title = "游戏网页已连接" }
        }
        pending = String(pending.suffix(8192))
    }

    @objc private func openGame() { NSWorkspace.shared.open(URL(string: "https://ianyet.github.io/agent-game/")!) }
    @objc private func openRelease() { NSWorkspace.shared.open(URL(string: "https://github.com/IanYet/agent-game/releases/latest")!) }
    @objc private func openData() {
        let environment = guardian.environment ?? [:]
        if let path = environment["AGENT_GAME_DATA_DIR"] { NSWorkspace.shared.open(URL(fileURLWithPath: path)) }
    }
    @objc func quit() {
        stop()
        if headless { exit(0) } else { NSApplication.shared.terminate(nil) }
    }
    func stop() {
        if stopping { return }; stopping = true
        try? lease.fileHandleForWriting.close()
        // Guardian has a bounded TERM/KILL grace period. Waiting guarantees the
        // port is released before a normal Quit returns.
        if guardian.isRunning { guardian.waitUntilExit() }
        output.fileHandleForReading.readabilityHandler = nil
        try? log?.close()
    }
    func applicationWillTerminate(_ notification: Notification) { stop() }
}

let connector = Connector()
if CommandLine.arguments.contains("--headless") {
    connector.start()
    RunLoop.main.run()
} else {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    app.delegate = connector
    app.run()
}
