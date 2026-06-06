## 2025-02-18 - Caching derived Vault Size with a composite key
**Learning:** The project uses `Object.freeze` on Vault entries. Caching UI states on `===` equality doesn't work well due to ecosystem constraints around mutation standards.
**Action:** When calculating expensive derived values for the UI, cache the result using explicit properties like `metadata.modified` and `entries.length` to safely detect state changes.
