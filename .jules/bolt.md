## 2024-06-01 - Vault UI Performance Investigation
**Learning:** Frequent UI updates trigger `updateUI()` which calculates `getVaultSize()` by stringifying and encoding the entire vault on every keystroke in the search bar. This is an expensive O(N) operation that runs synchronously on the main thread.
**Action:** Cache the JSON string and encoded byte array against the immutable `vault` instance to prevent redundant serialization and encoding during search keystrokes.
