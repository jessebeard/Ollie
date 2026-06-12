## 2024-06-08 - VaultUI Capacity Calculation Bottleneck
**Learning:** `getVaultSize()` in `VaultUI` calls `JSON.stringify(this.vault.toJSON())` and `TextEncoder().encode(json).length` on every `updateUI()` call. This is extremely expensive (O(N) with large constants) and blocks the main thread during simple UI interactions like typing in the search bar, because `updateUI()` is called frequently. The `PasswordVault` is an immutable structure, but ecosystem constraints prevent using `===` for caching.
**Action:** Implement memoization for `getVaultSize()` using a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to avoid recalculating the size when the vault content hasn't changed.

## 2024-06-08 - Vault Legacy UI Debounce Scoping
**Learning:** In the legacy `app/vault.js` implementation, the search input and its event listeners are completely recreated each time `renderEntries()` runs. If a debounce timeout is attached to a global scope or class instance, it risks race conditions involving detached DOM elements.
**Action:** When adding debouncing logic to high-frequency events in frequently re-rendered DOM components, define the timeout variable locally within the rendering function to correctly bound it to the current DOM elements.
