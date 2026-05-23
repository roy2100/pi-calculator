use wasm_bindgen::prelude::*;
use dashu::integer::IBig;
use dashu::base::BitTest;

struct BSResult {
    p: IBig,
    q: IBig,
    t: IBig,
}

fn binary_split(a: u64, b: u64) -> BSResult {
    if b - a == 1 {
        let k = IBig::from(a);
        let (p, q) = if a == 0 {
            (IBig::from(1), IBig::from(1))
        } else {
            let p = -(IBig::from(6) * &k - IBig::from(5))
                  * (IBig::from(2) * &k - IBig::from(1))
                  * (IBig::from(6) * &k - IBig::from(1));
            let q = IBig::from(10939058860032000u64) * &k * &k * &k;
            (p, q)
        };
        let t = &p * (IBig::from(13591409) + IBig::from(545140134) * &k);
        return BSResult { p, q, t };
    }

    let m = (a + b) / 2;
    let l = binary_split(a, m);
    let r = binary_split(m, b);
    combine(l, r)
}

fn combine(l: BSResult, r: BSResult) -> BSResult {
    BSResult {
        p: &l.p * &r.p,
        q: &l.q * &r.q,
        t: &r.q * &l.t + &l.p * &r.t,
    }
}

fn isqrt(n: &IBig) -> IBig {
    if *n == IBig::ZERO {
        return IBig::ZERO;
    }
    let bits = n.bit_len();
    let mut x = IBig::ONE << ((bits + 1) / 2);
    loop {
        let x1 = (&x + n / &x) >> 1;
        if x1 >= x {
            return x;
        }
        x = x1;
    }
}

fn finish_pi(bs: BSResult, digits: u64) -> String {
    let extra = digits + 20;
    let one = IBig::from(10).pow(extra as usize);
    let radicand = IBig::from(10005u32) * &bs.q * &bs.q * &one * &one;
    let sqrt_part = isqrt(&radicand);
    let pi_int = IBig::from(426880u32) * sqrt_part / &bs.t;

    let s = pi_int.to_string();
    if s.len() <= 1 {
        return "3.".to_string();
    }
    format!("{}.{}", &s[0..1], &s[1..digits as usize + 1])
}

// 单线程版本（用于小位数或后备）
#[wasm_bindgen]
pub fn compute_pi(digits: u32) -> String {
    let digits = digits as u64;
    let terms = (digits as f64 / 14.18).ceil() as u64 + 10;
    let bs = binary_split(0, terms);
    finish_pi(bs, digits)
}

// 并行版本：计算指定区间的 binary_split，以 pipe 分隔的十进制字符串返回
// 格式："p|q|t"
#[wasm_bindgen]
pub fn compute_split(a: u64, b: u64) -> String {
    let bs = binary_split(a, b);
    format!("{}|{}|{}", bs.p, bs.q, bs.t)
}

// 并行版本：接受左右两半的 p/q/t 字符串，合并后输出 pi
#[wasm_bindgen]
pub fn compute_pi_from_halves(
    digits: u32,
    lp: &str, lq: &str, lt: &str,
    rp: &str, rq: &str, rt: &str,
) -> String {
    let l = BSResult {
        p: lp.parse().unwrap_or(IBig::ONE),
        q: lq.parse().unwrap_or(IBig::ONE),
        t: lt.parse().unwrap_or(IBig::ZERO),
    };
    let r = BSResult {
        p: rp.parse().unwrap_or(IBig::ONE),
        q: rq.parse().unwrap_or(IBig::ONE),
        t: rt.parse().unwrap_or(IBig::ZERO),
    };
    let bs = combine(l, r);
    finish_pi(bs, digits as u64)
}
