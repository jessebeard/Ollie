## 2024-05-24 - Immutable Object Caching
**Learning:** Running synchronous JSON.stringify() and TextEncoder.encode() on large objects during frequent UI updates (e.g., search keystrokes) causes main-thread blocking. The PasswordVault class is fully immutable, returning new instances upon modifications.
**Action:** Cache these expensive derivations against the immutable object reference (e.g. this._cachedVault === this.vault) to avoid recalculation and improve UI responsiveness.
