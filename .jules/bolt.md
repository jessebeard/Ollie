## 2024-11-20 - O(1) Bit Length Computation
**Learning:** In JavaScript, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(Math.abs(val))` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains.
**Action:** Always prefer `Math.clz32` for determining the bit length or MSB position of an integer instead of iterating with `val >>= 1` in performance-critical code paths like JPEG encoding.
