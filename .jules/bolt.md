## 2024-06-03 - Cache Expensive Operations Against Immutable References
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on large objects during frequent UI updates (e.g., search keystrokes) causes main-thread blocking.
**Action:** Since `PasswordVault` is strictly immutable, cache these expensive derivations against the object reference itself to prevent recalculation on every UI update.
