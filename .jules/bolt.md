## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.

## 2024-06-08 - Vault String Search Performance
**Learning:** `search()` in `immutable-vault.js` was using `.toLowerCase().includes()` on each property (`title`, `url`, `username`) of each entry. For a large vault, string allocation overhead and linear substring matching per-property cause noticeable slowdowns on the main thread, especially as this logic is executed frequently during debounced UI typing.
**Action:** Replace `toLowerCase().includes()` inside hot loops with a single precompiled `RegExp` (with `'i'` flag), avoiding repeated string mutations.
