## 2025-04-04 - Array Pre-allocation for Block Aggregation
**Learning:** Performance Anti-pattern: When combining multiple large arrays (like combining component blocks in codecs), repeatedly calling `Array.prototype.push()` inside a loop causes memory reallocation overhead. Instead, pre-allocate the array with the exact combined size (`new Array(size)`) and assign values using an index tracker.
**Action:** Always pre-calculate the total size and pre-allocate the target array when aggregating large arrays.
