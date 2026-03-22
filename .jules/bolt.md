## 2024-05-24 - ImmutableVault index mapping
**Learning:** O(N) linear array searches (`Array.prototype.findIndex`) in immutable data structures can cause significant performance bottlenecks when scaling entries.
**Action:** When optimizing immutable data structures (like `PasswordVault`), initialize an internal index `Map` during constructor execution to map IDs to array indices. This ensures O(1) lookups without violating immutability, as the indices remain perfectly synchronized for the object's lifecycle.
