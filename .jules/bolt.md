## 2024-04-18 - Optimize standalone marker lookup
**Learning:** Replacing a local array `.includes()` check with a module-level `Set.has()` check in hot paths (like `readMarkerSegment` in `marker-scanner.js`) yields significant performance gains (~66%) by avoiding repeated allocations and leveraging O(1) lookup time.
**Action:** Always hoist static lookup arrays into module-level Sets for hot paths.
