## 2024-04-09 - Math.clz32 bit length calculation for Hot Path Optimization
**Learning:** `Math.clz32` (Count Leading Zeros) maps directly to hardware instructions, providing an O(1) way to determine the bit length of a number, significantly outperforming `while (val > 0) { val >>= 1; cat++; }` loops in JS.
**Action:** Use `32 - Math.clz32(val)` or `32 - Math.clz32(-val)` to find the bit length (or category) instead of loops for entropy coding, compression, or other mathematical hot paths.
