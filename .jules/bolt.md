## 2024-05-18 - [Optimize Marker Scanner Standalone Markers lookup]
**Learning:** Replacing a local array `.includes()` check with a module-level `Set.has()` check in hot paths (like `readMarkerSegment` in `marker-scanner.js`) yields significant performance gains by avoiding repeated allocations and leveraging O(1) lookup time.
**Action:** Always prefer `Set.has()` over array `.includes()` for static collections checked inside loops or hot paths.
