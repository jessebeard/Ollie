## 2024-04-25 - Redundant Clamping with Uint8ClampedArray
**Learning:** `Uint8ClampedArray` natively performs value clamping (0-255) and rounding (Banker's Rounding, nearest even integer). Executing manual explicit bounds checks (`Math.max(0, Math.min(255, Math.round(x)))`) inside hot, per-pixel rendering loops introduces massive function call overhead for zero functional gain.
**Action:** When populating `Uint8ClampedArray` buffers for image data, assign calculated floating-point values directly. Do not use `Math.max()`, `Math.min()`, or `Math.round()`.
