## 2024-03-10 - O(N) Array Lookups in Hot Decoding Paths
**Learning:** Array `.findIndex()` (or Maps `.get()`) inside the inner pixel/block decoding loops in JpegDecoder cause massive redundant work. In `decodeScan`, `compIndex` depends only on `scanComp.selector`, which doesn't change per MCU or per block.
**Action:** Always hoist component mapping, table lookups, and static dimension calculations outside the innermost loops in image codecs.
