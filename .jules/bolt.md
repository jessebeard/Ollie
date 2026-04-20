## 2024-04-20 - Math.clz32 for Bit Length
**Learning:** In hot paths involving entropy/Huffman coding, replacing `while` loops for calculating bit length (category) with `32 - Math.clz32(Math.abs(val))` provides measurable O(1) performance improvements by leveraging hardware instructions.
**Action:** Use `Math.clz32(Math.abs(val))` for positive/negative bit-length category computation.
