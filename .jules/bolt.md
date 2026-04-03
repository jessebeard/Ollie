## 2024-05-24 - Hoist component mappings in JpegDecoder
**Learning:** Placing array `.findIndex()` or Map `.get()` operations inside innermost pixel/block decoding loops in image codecs (like `JpegDecoder`) causes massive redundant work.
**Action:** Always hoist component mapping, table lookups, and static dimension calculations outside these innermost loops.
