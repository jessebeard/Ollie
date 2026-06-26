## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.

## 2024-06-26 - Repeated String Allocations in High-Frequency Filters
**Learning:** In both legacy and modern components of the vault UI, text filtering inside `search()` loops previously used `query.toLowerCase().includes(lower)` multiple times per array entry. For vaults with thousands of items, these repeated dynamic string allocations blocked the main thread significantly.
**Action:** Replace `toLowerCase().includes()` inside `.filter()` operations with a single, precompiled `RegExp` generated *before* the loop. Ensure Regex special characters are safely escaped first.
