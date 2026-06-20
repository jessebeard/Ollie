## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.

## 2024-06-20 - Vault Search Optimization via Precompiled RegExp
**Learning:** `immutable-vault.js` performs repeated string allocation by calling `.toLowerCase()` on the query and all searchable fields of every entry during `.filter()`. When typing in the UI search bar, this can impact performance by causing blocking due to garbage collection over a large number of strings in large vaults.
**Action:** Replace `.toLowerCase().includes()` inside hot array filter loops with a single precompiled, case-insensitive `RegExp`. This offers significantly faster text matching for large arrays without continuously allocating numerous intermediate strings.
