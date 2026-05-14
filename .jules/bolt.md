## 2024-05-24 - Main Thread Blocking on UI Updates
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on large objects during frequent UI updates (e.g., search keystrokes calling `getVaultSize()`) causes main-thread blocking.
**Action:** Cache these expensive derivations against the immutable object reference (e.g., `this.vault`) to improve performance.
