## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.

## 2024-06-15 - Text Search Array Allocations
**Learning:** Doing string allocation (e.g. `toLowerCase()`) over and over inside `.filter()` during high frequency UI updates like search queries creates garbage collection pressure and CPU drag.
**Action:** Use a single precompiled, case-insensitive `RegExp` to replace repeated `.toLowerCase().includes()` inside filter iterations. Ensure the search query is escaped for Regex special characters to prevent Syntax Errors.
