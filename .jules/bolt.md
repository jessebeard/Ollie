## 2025-05-18 - Cache expensive derivation against immutable state
**Learning:** JSON.stringify() and TextEncoder.encode() are synchronous and expensive, causing main-thread blocking during frequent UI updates.
**Action:** Cache expensive derived values using the immutable object's reference (===) to skip redundant recalculations.
