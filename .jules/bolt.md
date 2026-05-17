## 2024-05-17 - O(1) Bit-length computation with Math.clz32
**Learning:** In JavaScript, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(Math.abs(val))` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains.
**Action:** Use `Math.clz32` for fast bit-length or category calculations instead of manual bit-shifting loops.
