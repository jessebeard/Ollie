
## 2024-05-24 - O(1) Bit Length Computation in Huffman Coding
**Learning:** In hot paths like entropy/Huffman coding, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(val)` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains. Furthermore, for negative values, using `32 - Math.clz32(-val)` inline avoids branching and function call overhead.
**Action:** Always prefer `Math.clz32` for calculating bit lengths of integers instead of iterative bitwise shifts, especially in inner loops.
