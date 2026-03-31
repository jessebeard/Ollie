## 2024-03-31 - [Hoist find/findIndex from JPEG decoder loops]
**Learning:** Calling `Array.prototype.find()` and `Array.prototype.findIndex()` inside the innermost tight loop for block decoding in `JpegDecoder.js` creates a significant O(N) performance bottleneck per block iteration, leading to excessive function calls and repeated array iterations.
**Action:** Always hoist component lookups and static variable calculations out of innermost loops by building a precomputed dictionary or array.
