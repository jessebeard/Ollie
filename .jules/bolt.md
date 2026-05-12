## 2024-05-15 - Unnecessary Serialization in UI Updates
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on large immutable vault objects during every UI update (e.g., from search keystrokes) causes significant main-thread blocking.
**Action:** Cache expensive derivations (like vault byte size) against the immutable reference of the object. Since the object is immutable, the cached value remains valid as long as the reference doesn't change.
