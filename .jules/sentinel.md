## 2024-05-11 - VaultView URL Launch XSS Vulnerability

**Vulnerability:** The Vault UI allowed execution of arbitrary `javascript:` URIs when launching a user-provided URL via the Launch button, and did not enforce `noopener,noreferrer` for `_blank` targets.

**Learning:** User-controlled URLs should never be blindly passed to `window.open` without protocol validation, as attackers can craft `javascript:alert(1)` payloads that execute within the context of the application. Also, fallback behavior of prepending `https://` should be robust.

**Prevention:** Use `new URL(url).protocol` to explicitly whitelist safe protocols like `http:` and `https:`, and always use `noopener,noreferrer` to prevent reverse tabnabbing attacks. Added a Property-Based Test (PBT) to automatically detect if invalid protocols or missing features occur in `window.open`.
