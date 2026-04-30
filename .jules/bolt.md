## 2025-01-20 - Set.has() replacing Array.includes()
**Learning:** In the hot path of reading segments (`readMarkerSegment`), we were allocating an array of `standaloneMarkers` and calling `.includes()` every single time.
**Action:** Replaced `.includes()` with a module-level `Set` (`STANDALONE_MARKERS`) and used `.has()` to avoid repeated allocations and to execute an O(1) lookup.