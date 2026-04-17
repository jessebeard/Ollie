
## 2024-05-18 - Fast bit-length computation with Math.clz32
**Learning:** In hot paths like entropy/Huffman coding, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(val)` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains.
**Action:** Use `32 - Math.clz32(Math.abs(val))` for positive and negative numbers. For known negative numbers `val`, use `32 - Math.clz32(-val)` to avoid branching and function call overhead from `Math.abs`.
