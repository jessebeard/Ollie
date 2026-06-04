## 2024-06-04 - Caching PasswordVault Derived Values
**Learning:** Due to strict immutability/review standards, caching derived values for the Vault UI (like `JSON.stringify` or `TextEncoder.encode` on the entire vault) should not rely purely on object identity (`===`).
**Action:** Use a composite key of the modified timestamp and entry count (e.g., `${vault.metadata?.modified}-${vault.entries?.length}`) to safely verify state changes for caching.
