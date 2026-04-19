## 2024-05-17 - Hoist Array to Module-level Set in hot paths
**Learning:** Replacing a local array `.includes()` check with a module-level `Set.has()` check in hot paths yields significant performance gains by avoiding repeated allocations and leveraging O(1) lookup time.
**Action:** When a static list of items is used for inclusion checks in a frequently called function, define it as a module-level `Set` and use `.has()`.
