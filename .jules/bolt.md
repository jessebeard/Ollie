## 2024-06-13 - Fast 1D Array Flattening
**Learning:** Using `Array.push()` iteratively to flatten multiple large block arrays (like DCT coefficient blocks) causes significant performance overhead due to reallocation. Pre-calculating total size, using `new Array(totalSize)`, and assigning by index reduces execution time by ~65%.
**Action:** Use a two-pass strategy to flatten large arrays when performance is critical.
