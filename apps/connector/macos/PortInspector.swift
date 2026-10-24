import Foundation
import Darwin

struct ProcessIdentity {
    let pid: Int32
    let birth: UInt64
    let parent: Int32
    let path: String
    static func read(_ pid: Int32) -> ProcessIdentity? {
        var birth: UInt64 = 0, parent: Int32 = 0
        var buffer = [CChar](repeating: 0, count: 4096)
        guard tz_process_info(pid, &birth, &parent, &buffer, 4096) == 0 else { return nil }
        return ProcessIdentity(pid: pid, birth: birth, parent: parent, path: String(cString: buffer))
    }
}

struct PortOwner: Identifiable {
    var id: Int32 { pid }
    let pid: Int32
    let name: String
    let identity: ProcessIdentity?
    let addresses: [String]
    let owned: Bool
    let application: ProcessIdentity?
    let kind: String
    var description: String { "\(name) · PID \(pid)\n\(identity?.path.isEmpty == false ? identity!.path : "无法获取程序路径（可能没有权限）")\n\(addresses.joined(separator: "\n"))" }
}

enum PortInspector {
    static func inspect(port: Int, ownedPid: Int32) async throws -> [PortOwner] {
        try await Task.detached(priority: .userInitiated) {
            let result = try run("/usr/sbin/lsof", ["-nP", "-a", "-iTCP:\(port)", "-sTCP:LISTEN", "-Fpcftn"])
            // lsof returns 1 for an empty result as well as errors. Never present
            // an error on stderr as a successfully inspected, free port.
            if !result.error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { throw failure("无法完整读取监听信息：\(result.error)") }
            if result.code != 0 && !(result.code == 1 && result.output.isEmpty) { throw failure("lsof 检测失败（\(result.code)），请重新检测。") }
            var current: Int32 = 0, family = "", names: [Int32: String] = [:], addresses: [Int32: [String]] = [:]
            for line in result.output.split(separator: "\n") {
                if line.first == "p", let pid = Int32(line.dropFirst()) { current = pid; addresses[pid] = [] }
                else if line.first == "c" { names[current] = String(line.dropFirst()) }
                else if line.first == "f" { family = "" }
                else if line.first == "t" { family = String(line.dropFirst()) }
                else if line.first == "n", current > 0 { addresses[current, default: []].append((family.isEmpty ? "" : family + " · ") + String(line.dropFirst())) }
            }
            return addresses.keys.sorted().map { pid in
                let identity = ProcessIdentity.read(pid)
                var ancestor = identity, application: ProcessIdentity?
                for _ in 0..<6 {
                    guard let next = ancestor, next.pid > 1 else { break }
                    if let range = next.path.range(of: ".app/Contents/MacOS/"), let bundle = Bundle(path: String(next.path[..<range.lowerBound]) + ".app"), bundle.bundleIdentifier == "io.github.ianyet.agent-game.connector", bundle.executableURL?.standardizedFileURL.path == URL(fileURLWithPath: next.path).standardizedFileURL.path { application = next; break }
                    ancestor = ProcessIdentity.read(next.parent)
                }
                var residual = false
                if let path = identity?.path, let range = path.range(of: ".app/Contents/Resources/runtime/node"), let bundle = Bundle(path: String(path[..<range.lowerBound]) + ".app") { residual = bundle.bundleIdentifier == "io.github.ianyet.agent-game.connector" }
                let owned = pid == ownedPid
                let kind = owned ? "本连接器启动的服务" : application != nil ? "另一实例的连接器（按父进程与应用标识识别）" : residual ? "旧版或残留的连接器运行时（按应用路径识别）" : "其他程序／身份未确认"
                return PortOwner(pid: pid, name: identity.flatMap { $0.path.isEmpty ? nil : URL(fileURLWithPath: $0.path).lastPathComponent } ?? names[pid] ?? "无法读取进程名称", identity: identity, addresses: Array(Set(addresses[pid] ?? [])).sorted(), owned: owned, application: application, kind: kind)
            }
        }.value
    }

    static func terminate(port: Int, expected: PortOwner) async throws -> String {
        guard let identity = expected.identity else { return "无法确认进程身份，未执行结束操作。请从原程序退出。" }
        let latest = try await inspect(port: port, ownedPid: 0)
        guard let target = latest.first(where: { $0.pid == expected.pid }) else { return "该进程已不再监听此端口，已重新检测。" }
        guard target.identity?.birth == identity.birth, target.identity?.path == identity.path else { return "进程身份已经变化，未执行结束操作。" }
        // Check microsecond creation time immediately before signalling this PID.
        // Darwin provides no Windows-style process handle for sending a signal.
        let code = tz_signal_same(expected.pid, identity.birth, SIGKILL)
        switch code {
        case 0: try? await Task.sleep(nanoseconds: 300_000_000); return "已向 PID \(expected.pid) 发送强制结束信号，已重新检测端口。"
        case ESRCH: return "该进程已经退出，已重新检测端口。"
        case EPERM, EACCES: return "没有结束此进程的权限。请保存任务并在原程序退出，再重新检测；连接器不会自行提权。"
        case ESTALE: return "进程身份已经变化，未执行结束操作。"
        default: return "结束失败：\(String(cString: strerror(code)))。请重新检测。"
        }
    }
    static func failure(_ message: String) -> NSError { NSError(domain: "TongZhuo", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    private static func run(_ path: String, _ arguments: [String]) throws -> (output: String, error: String, code: Int32) {
        let process = Process(), output = Pipe(), errors = Pipe()
        process.executableURL = URL(fileURLWithPath: path); process.arguments = arguments
        process.standardOutput = output; process.standardError = errors
        try process.run()
        // A timeout only targets this newly created lsof process.
        let timeout = DispatchWorkItem { if process.isRunning { process.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now() + 5, execute: timeout)
        let bytes = output.fileHandleForReading.readDataToEndOfFile()
        let error = errors.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit(); timeout.cancel()
        return (String(decoding: bytes, as: UTF8.self), String(decoding: error, as: UTF8.self), process.terminationStatus)
    }
}
