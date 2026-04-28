## 2024-05-18 - Uint8ClampedArray native handling
**Learning:** When calculating and assigning pixel values to a `Uint8ClampedArray` (e.g., during image data assembly), avoid redundant manual bounds clamping and rounding using `Math.max(0, Math.min(255, Math.round(x)))`. The typed array natively handles [0, 255] clamping and rounding to the nearest integer, and eliminating these explicit `Math.*` calls significantly reduces function call overhead in hot loops.
**Action:** Always let `Uint8ClampedArray` handle bounds clamping and rounding internally during pixel array generation.
