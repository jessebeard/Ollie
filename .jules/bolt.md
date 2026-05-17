## 2024-05-24 - O(1) Bit-length Computation
**Learning:** Using `Math.clz32` for category/bit-length computation provides a significant (~9x) performance boost over `while` loops or `if/else if` chains. This is highly relevant given the massive number of DCT coefficients processed during encoding and steganography.
**Action:** Replace bitwise `while` loops for bit-length computation with `32 - Math.clz32(Math.abs(val))` where appropriate to leverage hardware instructions.
