## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.
## 2024-06-08 - String Filtering Bottleneck
**Learning:** In loops over arrays containing repeated string manipulations like `.toLowerCase().includes()`, significant execution time and Garbage Collection pauses occur due to repeated memory allocations for strings on every iteration.
**Action:** Instantiate a precompiled case-insensitive `RegExp` object outside the loop and use `RegExp.test()` inside to reduce memory allocations and speed up processing.
