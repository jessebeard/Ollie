## 2026-05-09 - Fast Bit Length Computation via Math.clz32
**Learning:** In JavaScript, calculating the bit length (or category) of integers using an O(log N) bitwise `while` loop (e.g., `while (val > 0) { val >>= 1; cat++; }`) is inefficient compared to hardware-level operations.
**Action:** Replace bitwise length computation loops with `32 - Math.clz32(Math.abs(val))` for O(1) performance. `Math.clz32` directly maps to hardware Count Leading Zeros (CLZ) instructions, yielding significant speedups for highly active loops like Huffman encoding.
