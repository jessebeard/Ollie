## 2024-06-05 - Avoid recalculating derived state on every UI update
**Learning:** `JSON.stringify` followed by `TextEncoder.encode` is a very expensive operation when run continuously on large objects like an entire Vault on every UI render/interaction.
**Action:** Always cache expensive derived values using composite keys based on state fields like `modified` timestamp and item count, especially when pure identity checks (`===`) are considered unreliable.
