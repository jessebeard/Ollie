## 2024-05-27 - Cache Expensive Derivations against Immutable Objects
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on large objects during frequent UI updates (like keystroke searches) causes main-thread blocking. Because the underlying object (`PasswordVault`) is perfectly immutable, we can safely cache these expensive operations using a simple reference equality (`===`) check.
**Action:** When deriving expensive values from immutable state, cache the result against the object reference instead of recomputing it on every render or update cycle.
