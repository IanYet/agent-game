#include <stdint.h>
int tz_process_info(int pid, uint64_t *birth, int *parent, char *path, unsigned int capacity);
int tz_signal_same(int pid, uint64_t birth, int signal_number);
