## 2024-05-30 - Immutable Reference Caching for Expensive Operations
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on large objects during frequent UI updates (e.g., search keystrokes) causes main-thread blocking.
**Action:** Cache these expensive derivations against the immutable object reference (e.g., `this.vault`) to improve performance.
