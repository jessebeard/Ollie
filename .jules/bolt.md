## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.
## 2024-07-01 - RegExp text search optimization
**Learning:** In high-frequency UI updates like vault searches, avoid repeated string allocations (e.g., `.toLowerCase().includes()`) inside `.filter()` loops. Instead, use a single precompiled, case-insensitive `RegExp` for significantly faster O(N) text matching.
**Action:** Use `new RegExp(..., 'i')` instead of string `.toLowerCase().includes()` when filtering arrays based on user text input.
