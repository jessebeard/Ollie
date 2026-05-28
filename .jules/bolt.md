## 2024-05-28 - Expensive Serialization in UI Render Loop
**Learning:** Running synchronous `JSON.stringify()` and `TextEncoder.encode()` on the entire vault object during frequent UI updates (like keystroke search rendering) blocks the main thread. Because the `PasswordVault` is fully immutable, derived values can be safely cached against the object reference.
**Action:** Cache expensive derivations (like size calculation) using reference equality (`===`) checks against immutable architecture components to avoid redundant processing on every render.
