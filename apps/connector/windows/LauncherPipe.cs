using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Microsoft.UI.Dispatching;

namespace TongZhuo;

// Only the current Windows user can connect. No HTTP shutdown endpoint exists.
internal sealed class LauncherPipe : IDisposable {
    private readonly CancellationTokenSource cancellation = new();
    internal LauncherPipe(int port, Func<int> pid, Action show, Action quit, DispatcherQueue dispatcher) {
        _ = Task.Run(async () => {
            while (!cancellation.IsCancellationRequested) {
                try {
                    using var server = new NamedPipeServerStream(Name(port), PipeDirection.InOut, 2, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                    await server.WaitForConnectionAsync(cancellation.Token);
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation.Token); timeout.CancelAfter(1500);
                    using var reader = new StreamReader(server, Encoding.UTF8, false, 1024, true);
                    using var writer = new StreamWriter(server, new UTF8Encoding(false), 1024, true) { AutoFlush = true };
                    string? line = await reader.ReadLineAsync(timeout.Token);
                    if (line is null || line.Length > 1024) continue;
                    using var request = JsonDocument.Parse(line); var r = request.RootElement;
                    string? command = r.GetProperty("command").GetString();
                    int targetPid = r.TryGetProperty("expectedPid", out var expected) ? expected.GetInt32() : 0;
                    bool canQuit = command == "quit" && targetPid > 0 && targetPid == pid();
                    await writer.WriteLineAsync(JsonSerializer.Serialize(new { product = "TongZhuo.Connector", launcherPid = Environment.ProcessId, listenerPid = pid(), accepted = command != "quit" || canQuit }));
                    if (command == "show") dispatcher.TryEnqueue(() => show());
                    if (canQuit) dispatcher.TryEnqueue(() => { if (pid() == targetPid) quit(); });
                } catch (OperationCanceledException) { }
                catch (IOException) { }
                catch (Exception e) when (e is JsonException or InvalidOperationException or KeyNotFoundException or UnauthorizedAccessException) { }
            }
        });
    }
    private static string Name(int port) => $"TongZhuo.Connector.{port}";
    internal static async Task<JsonElement?> SendAsync(int port, string command, int expectedPid = 0) {
        try {
            using var timeout = new CancellationTokenSource(900);
            using var client = new NamedPipeClientStream(".", Name(port), PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            await client.ConnectAsync(timeout.Token);
            using var reader = new StreamReader(client, Encoding.UTF8, false, 1024, true);
            using var writer = new StreamWriter(client, new UTF8Encoding(false), 1024, true) { AutoFlush = true };
            await writer.WriteLineAsync(JsonSerializer.Serialize(new { command, expectedPid }));
            string? line = await reader.ReadLineAsync(timeout.Token);
            if (line is null || line.Length > 2048) return null;
            using var json = JsonDocument.Parse(line);
            if (json.RootElement.GetProperty("product").GetString() != "TongZhuo.Connector" || !json.RootElement.GetProperty("accepted").GetBoolean()) return null;
            return json.RootElement.Clone();
        } catch (Exception e) when (e is IOException or OperationCanceledException or JsonException or UnauthorizedAccessException or InvalidOperationException or KeyNotFoundException) { return null; }
    }
    public void Dispose() => cancellation.Cancel();
}
