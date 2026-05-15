## 2024-05-15 - Array Pre-allocation length fallback check
**Learning:** When replacing incremental Array.push() calls with a two-pass pre-allocation strategy (new Array(totalSize)), be careful to update any fallback logic that checks array.length === 0. Because the array is pre-allocated, its length is fixed early; check the source data's size or a counter instead to determine emptiness.
**Action:** Always review downstream logic that checks array length or emptiness when refactoring to pre-allocated arrays, using the calculated total size or a counter variable instead.
