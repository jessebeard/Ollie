## 2025-02-24 - Immutable Object Caching for Expensive Derivations
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on large objects during frequent UI updates (e.g., search keystrokes) causes main-thread blocking. Because the `PasswordVault` in this codebase is immutable, its reference is a reliable cache key.
**Action:** Cache these expensive derivations against the immutable object reference (`this.vault`) to avoid recalculating unchanged data during render loops.
