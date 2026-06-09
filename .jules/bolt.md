## 2024-05-24 - Vault Size Caching with Immutability Constraints
**Learning:** The PasswordVault class uses Object.freeze, but ecosystem constraints treat it as mutable, meaning reference equality (===) checks are unsafe for cache invalidation.
**Action:** Use a composite key combining explicit state properties like `${vault.metadata?.modified}-${vault.entries?.length}` to safely detect state changes when caching expensive derived values like vault size serialization.
