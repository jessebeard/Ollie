## 2024-05-11 - Fast category computation with Math.clz32
**Learning:** In JavaScript, replacing O(log N) bitwise while loops for category/bit-length computation with 32 - Math.clz32(Math.abs(val)) transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains.
**Action:** Use Math.clz32 for computing bit lengths or categories instead of while loops.
