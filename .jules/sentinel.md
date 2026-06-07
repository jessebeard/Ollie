## 2025-02-14 - Fix UI Attribute XSS

**Vulnerability:** XSS Attribute Injection in Vault UI (escapeHtml did not escape quotes, allowing breakout in data attributes).
**Learning:** `div.innerHTML` text assignment escapes `<, >, &` but leaves quotes raw, which is fatal for attribute interpolation.
**Prevention:** Explicit string replacement handling all 5 entities (`&, <, >, ", '`) should be used for HTML encoding.
