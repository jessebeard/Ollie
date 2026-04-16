## 2024-05-18 - JpegDecoder Hot Loop Optimization
**Learning:** In the core loop of `JpegDecoder` that processes image blocks across all MCUs, executing an array search (`findIndex`) to locate the component index causes unnecessary O(N) operations inside a hot loop. Because the component index does not change per block within a scan component, it can be computed once.
**Action:** Always hoist invariant lookups out of inner image processing loops to prevent redundant overhead.
