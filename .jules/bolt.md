
## 2025-02-18 - Fast O(1) bit-length computation using Math.clz32
**Learning:** Bitwise operations in JavaScript generally process numbers as 32-bit signed integers. When calculating the category (or bit-length) of a number during hot paths like Huffman encoding, O(log N) `while` loop bitwise shifting is considerably slower than using the natively supported O(1) hardware-level instruction mapped to `Math.clz32`.
**Action:** Replace `while (val > 0) { val >>= 1; cat++; }` with `32 - Math.clz32(val)`. Furthermore, if you know the number is negative, bypass `Math.abs(val)` entirely and use `-val` directly: `32 - Math.clz32(-val)` to completely eliminate branching and function call overhead.

## 2025-02-18 - Replacing hot-path array allocations with module-level Sets
**Learning:** Checking marker types inside a parser (like `marker-scanner.js`) by allocating a new array and calling `.includes()` on every segment parsed creates significant garbage collection churn and requires an O(N) lookup.
**Action:** Hoist the checking structure to the module level and convert it to a `Set`. Using `Set.has()` turns the operation into an O(1) lookup and entirely avoids the continuous allocation penalty, improving performance by over 60% in benchmarks.
