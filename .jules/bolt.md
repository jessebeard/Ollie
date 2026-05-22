## 2024-05-23 - Immutable Vault Reference Caching
**Learning:** Because the `PasswordVault` class is fully immutable, any derived properties (like vault JSON size or encoded representations) can be safely cached against the vault instance reference (`===`). Synchronously calculating these on every UI render (e.g., search keystrokes) blocks the main thread.
**Action:** Always cache expensive derivations using `if (this._lastVaultRef === this.vault)` when working with the vault in the UI layer.
