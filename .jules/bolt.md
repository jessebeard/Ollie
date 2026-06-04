## 2024-05-24 - Expensive derived UI state recalculations
**Learning:** Calculating expensive derived values, like JSON.stringify and TextEncoder.encode on the entire vault object on every updateUI() call causes significant UI thread lag, especially during frequent updates like typing in the search bar. We can't rely on reference equality for immutable objects in this environment.
**Action:** Cache the result of expensive derived calculations and use a composite key based on `metadata.modified` and `entries.length` for reliable cache invalidation instead of object identity.
