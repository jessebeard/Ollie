## 2024-06-06 - Cache expensive vault size calculation
**Learning:** Calling `JSON.stringify()` and `TextEncoder.encode()` on the entire vault on every UI update (like search keystrokes) creates a significant performance bottleneck.
**Action:** Always cache expensive derived values. Use explicit properties like `metadata.modified` and `entries.length` for cache invalidation rather than relying on object identity.
