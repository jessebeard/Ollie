## 2024-06-04 - XSS via Incomplete HTML Escaping
**Vulnerability:** The `escape` method in `VaultView` and `escapeHtml` in legacy `vault.js` do not properly escape single quotes, and the legacy DOM-based escaping leaves attribute injections vulnerable.
**Learning:** Using `div.textContent = str; return div.innerHTML` is insufficient for escaping in HTML contexts because it fails to escape quotes. Explicitly casting input to a string and fully escaping all special characters is necessary.
**Prevention:** Always use Regex-based escaping for `&`, `<`, `>`, `"`, and `'`. Cast inputs to a string explicitly, and handle `null`/`undefined` gracefully.
