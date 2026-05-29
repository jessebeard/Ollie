## 2024-05-14 - Immutable State Caching
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on large objects during frequent UI updates (e.g., search keystrokes) causes severe main-thread blocking (~300ms delays).
**Action:** Since `PasswordVault` is fully immutable, cache these expensive size derivations using a `WeakMap` keyed by the vault instance reference to guarantee immediate subsequent reads without risking memory leaks.
