## 2024-05-14 - O(1) Category Computation via Math.clz32
**Learning:** In JavaScript, replacing O(log N) bitwise `while` loops for category/bit-length computation with `32 - Math.clz32(Math.abs(val))` transforms it into an O(1) operation leveraging hardware instructions, yielding significant performance gains.
**Action:** When calculating JPEG categories or finding the most significant bit position of a 32-bit integer, use `Math.clz32` instead of loop-based or cascading if-else approaches.
