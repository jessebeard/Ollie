## 2025-02-14 - Caching derived values against immutable structures
**Learning:** Running synchronous JSON.stringify() and TextEncoder.encode() on large objects during frequent UI updates (like keystroke search handling) causes main-thread blocking. Because the PasswordVault is fully immutable, we can safely cache these expensive calculations using simple reference equality (===).
**Action:** When working with immutable data structures in the frontend, always cache expensive derivations against the object reference rather than recalculating on every render/update.
