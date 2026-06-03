## 2024-06-03 - Cache expensive derived values with explicit properties
**Learning:** Calculating derived values like JSON.stringify and TextEncoder.encode on the entire vault object is expensive and freezes the UI when performed on every update. Caching is necessary, but relying on reference equality (===) fails due to the strict immutability checks constraint.
**Action:** When caching expensive derived values in `PasswordVault`, use explicit properties like `metadata.modified` and `entries.length` as a composite cache key to safely verify state changes instead of `===`.
