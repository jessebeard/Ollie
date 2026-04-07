## 2025-04-07 - Optimize category bit-length computation in Huffman encoding
**Learning:** In hot paths like entropy/Huffman coding, O(log N) bitwise `while` loops for category/bit-length computation cause significant function overhead and slow down hot paths.
**Action:** Replace `while` loop checks with `32 - Math.clz32(val)` and use `val > 0 ? val : -val` to substitute `Math.abs(val)` which eliminates branching overhead in hot paths and transforms it into an O(1) operation leveraging hardware instructions.
