## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.

## 2024-06-17 - Vault Search Allocation Bottleneck
**Learning:** The `search` method in `VaultUI` (both modern and legacy) creates multiple `.toLowerCase()` string copies and calls `.includes()` inside the `.filter()` loop. This resulted in significant memory allocation overhead during high-frequency text searches. Replacing this with a single precompiled, case-insensitive `RegExp` reduces runtime significantly (e.g. from 495ms to 153ms for 100 iterations of 10k items).
**Action:** When filtering lists by text attributes, avoid repeated string allocations within loops. Instead, pre-compile a single case-insensitive Regex and test it against the list items.

## 2024-06-17 - Missing Empty String Search Check
**Learning:** When optimizing a search query with a regular expression, `null` initialization with a ternary operator like `const searchRegex = query ? new RegExp(...) : null` leads to a `TypeError` if `searchRegex.test()` is directly called during a filter. Empty strings evaluate to falsy, creating the unhandled null reference.
**Action:** Always include a short-circuit operator like `!searchRegex || ...` inside `.filter()` calls to gracefully handle null or falsy query initialization.
