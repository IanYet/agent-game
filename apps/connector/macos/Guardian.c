// A separate process owns the connector group. The launcher's CLOEXEC pipe is
// the lifetime lease: even SIGKILL closes it, without any Swift exit handler.
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/file.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

extern char **environ;
static volatile sig_atomic_t stopping = 0;
static void stop(int signo) { (void)signo; stopping = 1; }
static void pause_ms(void) { struct timespec delay = {0, 50000000}; nanosleep(&delay, NULL); }

int main(int argc, char **argv) {
    if (argc != 4) return 64; // lock path, embedded Node, connector bundle
    signal(SIGTERM, stop); signal(SIGINT, stop); signal(SIGHUP, stop);
    signal(SIGPIPE, SIG_IGN);
    int lock = open(argv[1], O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0600);
    if (lock < 0) { perror("connector lock"); return 1; }
    if (flock(lock, LOCK_EX | LOCK_NB) != 0) {
        fprintf(stderr, "此端口的连接器已经在运行。\n"); close(lock); return 73;
    }
    // Refuse to start if the launcher died before we acquired the lease.
    struct pollfd control = { STDIN_FILENO, POLLIN | POLLHUP, 0 };
    if (poll(&control, 1, 0) > 0 || stopping) { close(lock); return 0; }
    posix_spawnattr_t attr;
    posix_spawn_file_actions_t files;
    if (posix_spawnattr_init(&attr) || posix_spawn_file_actions_init(&files)) return 1;
    sigset_t empty, defaults;
    sigemptyset(&empty); sigemptyset(&defaults);
    sigaddset(&defaults, SIGTERM); sigaddset(&defaults, SIGINT); sigaddset(&defaults, SIGHUP); sigaddset(&defaults, SIGPIPE);
    int error = posix_spawnattr_setpgroup(&attr, 0);
    error |= posix_spawnattr_setsigmask(&attr, &empty);
    error |= posix_spawnattr_setsigdefault(&attr, &defaults);
    error |= posix_spawnattr_setflags(&attr, POSIX_SPAWN_SETPGROUP | POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_SETSIGDEF);
    error |= posix_spawn_file_actions_addopen(&files, STDIN_FILENO, "/dev/null", O_RDONLY, 0);
    char *args[] = { argv[2], argv[3], NULL };
    pid_t child = 0;
    if (!error) error = posix_spawn(&child, argv[2], &files, &attr, args, environ);
    posix_spawn_file_actions_destroy(&files); posix_spawnattr_destroy(&attr);
    if (error) { errno = error; perror("connector spawn"); close(lock); return 1; }
    // The group is established atomically before any Node/Harness code runs.
    printf("TONGZHUO_UI:{\"event\":\"spawned\",\"pid\":%d}\n", child); fflush(stdout);
    int status = 0;
    while (!stopping) {
        siginfo_t info = {0};
        int result = waitid(P_PID, (id_t)child, &info, WEXITED | WNOHANG | WNOWAIT);
        if (result == 0 && info.si_pid == child) break;
        if (result < 0 && errno != EINTR) break;
        int resultPoll = poll(&control, 1, 100);
        if (resultPoll > 0) break; // EOF or an explicit quit byte
        if (resultPoll < 0 && errno != EINTR) break;
    }
    // Clean the group even when Node itself exited. Keep the leader unreaped
    // during cleanup where possible, so its PID cannot be reused by another app.
    kill(-child, SIGTERM);
    for (int i = 0; i < 36 && kill(-child, 0) == 0; i++) pause_ms();
    kill(-child, SIGKILL);
    while (waitpid(child, &status, 0) < 0 && errno == EINTR) {}
    close(lock); // A new launcher may only start after the old group was killed.
    return WIFEXITED(status) ? WEXITSTATUS(status) : (stopping ? 0 : 1);
}
