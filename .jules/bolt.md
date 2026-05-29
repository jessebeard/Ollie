
## 2024-05-14 - Main thread blocking due to synchronous derivations on immutable UI updates
**Learning:** Running synchronous JSON.stringify() and TextEncoder.encode() on large objects during frequent UI updates (e.g., search keystrokes) causes main-thread blocking.
**Action:** Cache these expensive derivations against the immutable object reference (e.g., this.vault === cache.vault) to improve performance significantly during re-renders.
