## 2024-03-29 - Pre-allocating arrays avoids dynamic resizing overhead
**Learning:** When combining multiple large arrays (like combining component blocks in codecs), repeatedly calling `Array.prototype.push()` inside a loop causes memory reallocation overhead.
**Action:** Always pre-allocate the array with the exact combined size (`new Array(size)`) and assign values using an index tracker.
