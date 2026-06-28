## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.

## 2024-06-08 - Vault Search Regex Optimization
**Learning:** High-frequency vault searches create O(N) string allocations inside a `.filter()` loop by repeatedly calling `.toLowerCase().includes()`. Replacing these string manipulations with a single precompiled, case-insensitive `RegExp` significantly improves text matching performance in large vaults.
**Action:** Use precompiled `RegExp` objects for large dataset string filtering instead of per-element string allocations.
