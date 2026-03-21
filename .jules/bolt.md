## 2024-05-24 - O(1) Lookups in Immutable Structures
**Learning:** Sequential array lookups (e.g., `findIndex`) in frequently modified immutable data structures like `PasswordVault` can cause O(N) bottlenecks during operations like updates or deletions.
**Action:** Initialize an internal index `Map` during constructor execution to map IDs to array indices. This ensures O(1) lookups without violating immutability, as the indices remain perfectly synchronized for the object's lifecycle.
