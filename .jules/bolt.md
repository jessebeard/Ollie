## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.

## 2024-07-05 - RegExp Optimization for Array Filtering
**Learning:** Using `.toLowerCase().includes()` inside array `.filter()` loops causes repeated memory allocations for strings on every iteration, leading to execution slowdowns and Garbage Collection (GC) pauses.
**Action:** When filtering arrays based on string matches, precompile a case-insensitive `RegExp` outside the loop and use `RegExp.test()` inside the loop (ensuring truthiness checks for optional properties) to reduce memory allocations and improve execution speed.
