## 2024-05-18 - XSS Attribute Injection in Vault UI

**Vulnerability:** The HTML escaping function `escapeHtml` in `app/vault.js` is implemented using DOM `textContent` assignment, which escapes `<`, `>`, and `&`, but fails to escape single and double quotes (`'` and `"`). When this function is used to render user input into HTML attributes, such as `<button class="icon-btn copy-btn" data-value="${this.escapeHtml(entry.username)}" ...>`, an attacker can inject a double quote to break out of the attribute and inject malicious event handlers or structural changes (e.g. `"><script>alert(1)</script>`).

**Learning:** When escaping user input for dynamic HTML string interpolation (e.g., for `innerHTML`), using DOM text assignment (`div.textContent = str; return div.innerHTML;`) is insufficient because it does not escape double (`"`) or single (`'`) quotes, leaving attribute injections (like `value="..."`) vulnerable.

**Prevention:** Always use explicit Regex replacement to escape `&`, `<`, `>`, `"`, and `'`.
