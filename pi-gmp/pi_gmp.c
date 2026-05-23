#include <gmp.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

typedef struct {
    mpz_t p, q, t;
} BSResult;

static void bs_init(BSResult *r) {
    mpz_init(r->p);
    mpz_init(r->q);
    mpz_init(r->t);
}

static void bs_clear(BSResult *r) {
    mpz_clear(r->p);
    mpz_clear(r->q);
    mpz_clear(r->t);
}

/* 640320^3 / 24 = 10939058860032000，超出 32-bit unsigned long，用字符串初始化 */
static void set_chudnovsky_c3(mpz_t out) {
    mpz_set_str(out, "10939058860032000", 10);
}

static void binary_split(BSResult *res, unsigned long a, unsigned long b) {
    if (b - a == 1) {
        if (a == 0) {
            mpz_set_ui(res->p, 1);
            mpz_set_ui(res->q, 1);
            mpz_set_ui(res->t, 13591409);
        } else {
            mpz_t k, t1, t2, t3;
            mpz_init_set_ui(k, a);
            mpz_init(t1); mpz_init(t2); mpz_init(t3);

            /* p = -(6k-5)(2k-1)(6k-1) */
            mpz_mul_ui(t1, k, 6); mpz_sub_ui(t1, t1, 5);
            mpz_mul_ui(t2, k, 2); mpz_sub_ui(t2, t2, 1);
            mpz_mul_ui(t3, k, 6); mpz_sub_ui(t3, t3, 1);
            mpz_mul(res->p, t1, t2);
            mpz_mul(res->p, res->p, t3);
            mpz_neg(res->p, res->p);

            /* q = 10939058860032000 * k^3 */
            mpz_t c3, k3;
            mpz_init(c3); mpz_init(k3);
            set_chudnovsky_c3(c3);
            mpz_pow_ui(k3, k, 3);
            mpz_mul(res->q, c3, k3);
            mpz_clear(c3); mpz_clear(k3);

            /* t = p * (13591409 + 545140134*k) */
            mpz_mul_ui(t1, k, 545140134);
            mpz_add_ui(t1, t1, 13591409);
            mpz_mul(res->t, res->p, t1);

            mpz_clear(k); mpz_clear(t1); mpz_clear(t2); mpz_clear(t3);
        }
        return;
    }

    unsigned long m = (a + b) / 2;
    BSResult l, r;
    bs_init(&l); bs_init(&r);
    binary_split(&l, a, m);
    binary_split(&r, m, b);

    mpz_mul(res->p, l.p, r.p);
    mpz_mul(res->q, l.q, r.q);

    mpz_t tmp1, tmp2;
    mpz_init(tmp1); mpz_init(tmp2);
    mpz_mul(tmp1, r.q, l.t);
    mpz_mul(tmp2, l.p, r.t);
    mpz_add(res->t, tmp1, tmp2);
    mpz_clear(tmp1); mpz_clear(tmp2);

    bs_clear(&l); bs_clear(&r);
}

/*
 * 返回堆分配的字符串，调用者必须调用 free_string() 释放。
 * 格式: "3.14159265358979..."（小数点后 digits 位）
 */
EMSCRIPTEN_KEEPALIVE
char *compute_pi(unsigned int digits) {
    unsigned long terms = (unsigned long)(digits / 14.18) + 11;

    BSResult bs;
    bs_init(&bs);
    binary_split(&bs, 0, terms);

    /*
     * π = 426880 * sqrt(10005) * Q / T
     * 整数化: one = 10^(digits+20)
     *   radicand = 10005 * Q^2 * one^2
     *   sqrt_part = isqrt(radicand)  ≈  Q * one * sqrt(10005)
     *   pi_int = 426880 * sqrt_part / T  ≈  π * 10^(digits+19)
     */
    unsigned long extra = (unsigned long)digits + 20;

    mpz_t one, radicand, sqrt_part, pi_int;
    mpz_init(one); mpz_init(radicand);
    mpz_init(sqrt_part); mpz_init(pi_int);

    mpz_ui_pow_ui(one, 10, extra);

    mpz_mul(radicand, bs.q, bs.q);
    mpz_mul(radicand, radicand, one);
    mpz_mul(radicand, radicand, one);
    mpz_mul_ui(radicand, radicand, 10005);

    mpz_sqrt(sqrt_part, radicand);

    mpz_mul_ui(pi_int, sqrt_part, 426880);
    mpz_tdiv_q(pi_int, pi_int, bs.t);

    /* 转换为十进制字符串并插入小数点 */
    char *raw = mpz_get_str(NULL, 10, pi_int);
    size_t raw_len = strlen(raw);
    size_t out_len = (size_t)digits + 2; /* '3' + '.' + digits 位 */
    char *result = (char *)malloc(out_len + 1);

    if (raw_len <= 1) {
        strcpy(result, "3.");
    } else {
        result[0] = raw[0];
        result[1] = '.';
        size_t copy_len = (size_t)digits < raw_len - 1 ? (size_t)digits : raw_len - 1;
        memcpy(result + 2, raw + 1, copy_len);
        result[2 + copy_len] = '\0';
    }

    free(raw);
    mpz_clear(one); mpz_clear(radicand);
    mpz_clear(sqrt_part); mpz_clear(pi_int);
    bs_clear(&bs);

    return result;
}

EMSCRIPTEN_KEEPALIVE
void free_string(char *s) {
    free(s);
}
