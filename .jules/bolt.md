## 2025-03-26 - Array lookups in innermost image decoding loops
**Learning:** Executing array `.find()` or `.findIndex()` operations inside inner MCU decoding loops in image codecs (like `JpegDecoder.js`) causes massive redundant work. It's a severe performance bottleneck.
**Action:** Always precompute mapping variables and hoist lookups out of the innermost loops when possible.
