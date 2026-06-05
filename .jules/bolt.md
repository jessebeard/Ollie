## 2024-06-05 - Cache vault size calculations
**Learning:** Calculating vault size requires `JSON.stringify` and `TextEncoder.encode` on the entire vault object, which is expensive on UI re-renders. We cannot use reference equality `===` for caching `this.vault` due to ecosystem constraints or strict review standards, even though it relies on `Object.freeze`.
**Action:** Use a composite cache key based on `this.vault.metadata?.modified` and `this.vault.entries?.length` to correctly detect state changes for caching derived values in immutable structures.
