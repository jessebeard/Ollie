## 2024-05-24 - Cache Expensive Derivations against Immutable Objects
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on large objects during frequent UI updates (like search keystrokes) causes main-thread blocking. We can't attach cached properties directly to immutable `Object.freeze` vault instances (it throws TypeError).
**Action:** Cache these expensive derivations in the UI component state using the immutable vault object's reference equality (`===`) as the cache key.
