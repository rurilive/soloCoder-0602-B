#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <linux/seccomp.h>
#include <linux/filter.h>
#include <linux/audit.h>
#include <errno.h>

#define syscall_nr (offsetof(struct seccomp_data, nr))
#define arch_nr (offsetof(struct seccomp_data, arch))

#if defined(__x86_64__)
#define ARCH_NR AUDIT_ARCH_X86_64
#else
#error "Unsupported architecture"
#endif

static int allowed_syscalls[] = {
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    20, 21, 22, 25, 29, 32, 33, 34, 35, 36, 37, 38, 39, 56, 57, 58, 59, 60,
    63, 72, 73, 76, 77, 78, 79, 80, 82, 83, 89, 96, 97, 98, 99, 100, 101, 102,
    104, 105, 106, 107, 108, 109, 110, 111, 116, 117, 118, 123, 145, 146, 158,
    186, 199, 200, 201, 202, 217, 218, 231, 233, 234, 257, 258, 259, 260, 261, 262, 263,
    264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280,
    281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297,
    298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314,
    315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332
};

#define ALLOWED_COUNT (sizeof(allowed_syscalls) / sizeof(allowed_syscalls[0]))

static int install_seccomp() {
    struct sock_filter filter[1024];
    int filter_len = 0;

    filter[filter_len++] = (struct sock_filter) BPF_STMT(BPF_LD | BPF_W | BPF_ABS, arch_nr);
    filter[filter_len++] = (struct sock_filter) BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, ARCH_NR, 1, 0);
    filter[filter_len++] = (struct sock_filter) BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL);

    filter[filter_len++] = (struct sock_filter) BPF_STMT(BPF_LD | BPF_W | BPF_ABS, syscall_nr);

    for (int i = 0; i < ALLOWED_COUNT; i++) {
        filter[filter_len++] = (struct sock_filter) BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, allowed_syscalls[i], 0, 1);
        filter[filter_len++] = (struct sock_filter) BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW);
    }

    filter[filter_len++] = (struct sock_filter) BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | (EPERM & SECCOMP_RET_DATA));

    struct sock_fprog prog = {
        .len = filter_len,
        .filter = filter
    };

    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) {
        perror("prctl(PR_SET_NO_NEW_PRIVS)");
        return -1;
    }

    if (prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog)) {
        perror("prctl(PR_SET_SECCOMP)");
        return -1;
    }

    return 0;
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <program> [args...]\n", argv[0]);
        return 1;
    }

    if (install_seccomp() != 0) {
        return 1;
    }

    execvp(argv[1], &argv[1]);
    perror("execvp");
    return 1;
}
