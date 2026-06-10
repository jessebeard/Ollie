## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.

## 2024-06-08 - Synchronous DOM Rendering Bottleneck
**Learning:** The Vault UI search inputs fired synchronous filtering and full DOM re-rendering (`updateUI()`) on every keystroke. This causes severe lag during typing, especially when the vault is large, because `getVaultSize()` calculation inside `updateUI()` blocked the main thread.
**Action:** Debounce search inputs using `setTimeout` to batch rapid keystrokes into a single update. Always ensure UI handlers that trigger heavy computation or DOM rendering are debounced.
