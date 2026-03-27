## 2024-03-27 - Performance Anti-pattern: Iterative `Array.push()` for Large Image Block Arrays
**Learning:** Using `Array.prototype.push()` repeatedly within loops to combine large arrays of image blocks (e.g., combining component blocks in codecs or steganography scanners) causes significant performance degradation due to continuous memory reallocation overhead.
**Action:** Always pre-allocate arrays to the exact combined size (`new Array(totalSize)`) and assign elements using an incrementing offset index when flattening or aggregating large multi-component block structures.
