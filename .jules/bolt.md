## 2024-03-24 - Hardware accelerated Bit Length Calculation
**Learning:** In JavaScript, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(val)` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains (~20x faster in microbenchmarks). This is highly relevant in `computeCategory` functions used in entropy encoders.
**Action:** Replace while loops counting bits with `Math.clz32` wherever bit-length or JPEG categories are computed.
