## 2024-05-03 - [Optimize Huffman encoding category calculation]
**Learning:** In JavaScript, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(val)` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains.
**Action:** Always prefer `Math.clz32` for calculating the bit-length of an integer instead of using a `while` loop with a bitwise right-shift.
