I plan to implement the following performance optimization to cache the vault size calculation in `PasswordVault`, which is currently synchronous and expensive.

1. **Modify `src/structures/vault/immutable-vault.js`**:
   - Add a cached `_size` property getter or cache it internally, because `PasswordVault` is completely immutable. Once instantiated, its entries never change, so we can calculate the serialized size once.

2. **Modify `app/components/vault/vault-ui.js`**:
   - Change `getVaultSize()` to use the cached value.

Is this acceptable? I have documented this learning in `.jules/bolt.md`.
