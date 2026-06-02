## 2024-06-02 - Incomplete HTML Escaping Allows XSS

**Vulnerability:** The HTML escaping methods (`VaultView.escape` and `VaultUI.escapeHtml`) are incomplete or flawed. `VaultView.escape` doesn't cast inputs to strings (causing crashes on non-strings like numbers) and misses single quotes (`'`). `VaultUI.escapeHtml` relies on DOM text assignment (`div.textContent = str; return div.innerHTML`), which doesn't escape quotes at all, allowing attribute injection (e.g. `value="..."`).

**Learning:** When escaping user input for dynamic HTML string interpolation, explicit regex replacement covering `&`, `<`, `>`, `"`, and `'` must be used. Additionally, input should be cast to a string to prevent TypeErrors, and empty values gracefully handled.

**Prevention:** Always use explicit robust escaping functions for HTML context, casting variables to string, and replacing all 5 key characters (`&`, `<`, `>`, `"`, `'`). Provide Property-Based Tests (PBT) asserting that structural attributes can't be broken out of.
