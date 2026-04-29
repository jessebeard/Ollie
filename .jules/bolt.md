## 2024-04-29 - Optimize Array.includes() with Set.has()
**Learning:** Replacing a local array `.includes()` check with a module-level `Set.has()` check in hot paths (like `readMarkerSegment` in `marker-scanner.js`) yields significant performance gains (~66%) by avoiding repeated allocations and leveraging O(1) lookup time.
**Action:** Always look for static local arrays initialized in hot loops that are only used for inclusion checking, and hoist them to module-level Sets to avoid repeated allocations and gain O(1) checks.
