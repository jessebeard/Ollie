## 2024-05-23 - Fast category computation using Math.clz32
**Learning:** In JavaScript, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(Math.abs(val))` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains.
**Action:** Use `Math.clz32` for fast log2 and bit length calculations instead of loops when the number fits within 32 bits.
