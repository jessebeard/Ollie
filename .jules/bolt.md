## 2024-05-18 - Optimize large array flattening
**Learning:** Incremental `Array.push()` calls in a loop cause expensive memory reallocations, which block the main thread when flattening massive arrays (like DCT block collections). Using a two-pass strategy (calculating total size first, then pre-allocating with `new Array(totalSize)`) significantly improves performance.
**Action:** For large array assembly, calculate total elements beforehand and pre-allocate memory. Update fallback conditions that rely on `array.length === 0` to check the pre-calculated size instead.
