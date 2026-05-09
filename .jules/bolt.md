## 2025-02-12 - Optimize computeCategory with Math.clz32
**Learning:** In JavaScript, replacing O(log N) bitwise while loops for category/bit-length computation with 32 - Math.clz32(Math.abs(val)) transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains.
**Action:** Use 32 - Math.clz32() instead of while loops for bit-length calculation next time.
