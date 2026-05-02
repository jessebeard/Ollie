## 2024-05-24 - Hardware accelerated category length computation
**Learning:** In JavaScript, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(Math.abs(val))` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains.
**Action:** Always look for loops dividing by 2 or right-shifting by 1 that count bit lengths and replace them with `Math.clz32` equivalents where the input range allows (32-bit integers).
