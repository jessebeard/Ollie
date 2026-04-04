## 2024-03-24 - Pre-allocate arrays instead of pushing in large loops
**Learning:** When combining multiple large arrays (like combining component blocks in codecs), repeatedly calling `Array.prototype.push()` inside a loop causes memory reallocation overhead.
**Action:** Pre-allocate the array with the exact combined size (`new Array(size)`) and assign values using an index tracker.
