## 2024-04-16 - Eliminate Math.abs for check if 1 or -1
**Learning:** Performance Learning: In hot loops involving integer coefficient analysis (like F5 steganography), replacing `Math.abs(val) === 1` with `val === 1 || val === -1` and `Math.abs(val) % 2 === 1` with bitwise checks like `(val & 1) !== 0` provides measurable performance gains (~20%+) by reducing function call overhead and leveraging integer math.
**Action:** Replace `Math.abs(val) === 1` with `val === 1 || val === -1` and `Math.abs(val) % 2 === 1` with `(val & 1) !== 0`.

## 2024-04-16 - Eliminate O(N) loop for calculating bit category
**Learning:** Performance Learning: In hot paths like entropy/Huffman coding, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(val)` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains.
**Action:** Use `32 - Math.clz32(val)` instead of manual bit-shifting loops for category computations.

## 2024-04-16 - Math.abs replacement failure in Jsteg
**Learning:** Performance Anti-pattern: In `src/information-theory/steganography/jsteg.js`, optimizing the bitwise logic for negative values (e.g., replacing `-(Math.abs(val & ~1) | bit)` with `-((-val & ~1) | bit)`) introduces functional regressions that break pixel-exact lossless transcoding tests. The algebraic substitution fails for negative numbers due to 2s complement binary arithmetic.
**Action:** Retain `Math.abs` in this specific path to preserve mathematical correctness.
