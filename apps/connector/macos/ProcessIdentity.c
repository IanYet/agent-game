#include "ProcessIdentity.h"
#include <errno.h>
#include <libproc.h>
#include <signal.h>
#include <sys/proc_info.h>
#include <unistd.h>

int tz_process_info(int pid, uint64_t *birth, int *parent, char *path, unsigned int capacity) {
    struct proc_bsdinfo info = {0};
    if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != (int)sizeof(info)) return errno ? errno : ESRCH;
    *birth = info.pbi_start_tvsec * 1000000ULL + info.pbi_start_tvusec;
    *parent = (int)info.pbi_ppid;
    if (capacity) { path[0] = 0; if (proc_pidpath(pid, path, capacity) <= 0) path[0] = 0; }
    return 0;
}

int tz_signal_same(int pid, uint64_t expected, int number) {
    if (pid <= 1 || pid == getpid()) return EPERM;
    uint64_t birth = 0; int parent = 0; char unused[1];
    int error = tz_process_info(pid, &birth, &parent, unused, 0);
    if (error) return error;
    if (birth != expected) return ESTALE;
    return kill(pid, number) == 0 ? 0 : errno;
}
