## 2024-04-11 - Optimize Array Flattening using Pre-allocation

**Learning:** When combining multiple large arrays (like combining component blocks in codecs), repeatedly calling `Array.prototype.push()` inside a loop causes memory reallocation overhead.
**Action:** Instead, pre-allocate the array with the exact combined size (`new Array(size)`) and assign values using an index tracker.
