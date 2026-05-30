## 2025-02-28 - Inadequate XSS Escaping

**Vulnerability:** The HTML escaping methods used in `app/vault.js` (`escapeHtml`) and `app/components/vault/components/vault-view.js` (`escape`) were insufficient. `escapeHtml` used DOM text assignment which fails to escape quotes (`"` and `'`), making it vulnerable to attribute injection XSS. `VaultView.escape` did not cast inputs to strings safely, used falsy checks (`!str`) that could strip valid inputs like `0` or `false`, and failed to escape single quotes (`'`).

**Learning:** When escaping user input for dynamic HTML string interpolation, DOM text assignment is insufficient because it does not escape quotes, leaving attributes vulnerable. Furthermore, strict falsy checks on inputs can lead to missing valid data, and failure to explicitly cast to strings can cause `TypeError`s with numbers or booleans.

**Prevention:** Use a robust RegExp-based replacement function that explicitly handles `&`, `<`, `>`, `"`, and `'`. Ensure inputs are checked for nullish values (`str == null`) rather than falsy ones, and explicitly cast the value to a string (`String(str)`) before escaping. Always use property-based testing targeting specific breakout contexts rather than absolute absence of structural tags.
