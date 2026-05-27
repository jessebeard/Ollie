## 2024-05-27 - Cache derived properties on immutable objects
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on large objects during frequent UI updates (like `updateUI()` called on search keystrokes) causes main-thread blocking. Because `PasswordVault` is fully immutable, we can safely cache these expensive derivations against the object reference.
**Action:** When a property is expensive to compute and derived purely from an immutable object, cache the result using reference equality (`===`) checks to prevent redundant calculations during render loops.
