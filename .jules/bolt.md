## 2024-06-02 - Caching derived vault values
**Learning:** When calculating expensive derived values for the UI (like `JSON.stringify` or `TextEncoder.encode` on the entire vault inside `getVaultSize()`), doing this synchronously on every keystroke blocks the main thread.
**Action:** Cache the result using the strictly immutable `vault` instance reference (`this._cachedVault === this.vault`). This simple cache invalidation strategy safely prevents synchronous main-thread blocking.
