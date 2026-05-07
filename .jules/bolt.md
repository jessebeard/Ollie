## 2024-05-24 - Hardware instruction optimization for categories
**Learning:** In JavaScript, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(val)` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains, especially in high frequency paths like Huffman encoding.
**Action:** Always prefer `Math.clz32` for finding the number of bits needed to represent an integer over bit-shifting `while` loops.
