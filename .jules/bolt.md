## 2024-05-24 - Cache Expensive Derivations
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on large objects during frequent UI updates (e.g., search keystrokes) causes main-thread blocking.
**Action:** Cache these expensive derivations against the immutable object reference (`===`) to avoid redundant calculations and improve performance.
