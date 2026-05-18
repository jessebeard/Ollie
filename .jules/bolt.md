## 2024-05-18 - JSON.stringify Cache in Vault UI
**Learning:** Calling `JSON.stringify()` and `TextEncoder.encode()` on the entire vault on every UI update (e.g. typing in the search box) blocks the main thread.
**Action:** Cache the calculated size because the vault is an immutable structure. Only recompute when the vault reference changes.
