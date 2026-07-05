## 2024-11-20 - XSS vulnerabilities when non-strings and single quotes bypass escape routines
**Vulnerability:** The HTML escape function threw TypeErrors when given non-string values (like integers or booleans) because `.replace` is a String method, leading to component rendering failure and potential fallback attacks. Furthermore, single quotes were not escaped, allowing XSS in single-quote delimited attribute contexts.
**Learning:** Escape functions must be defensive and accept any primitive value securely without failing. In JS, `String(str)` explicitly casts values safely. Single quotes (`'`) must be escaped (`&#39;`) just as double quotes are.
**Prevention:** Always cast inputs in Regex-based HTML escape functions and check `if (str == null)` rather than `if (!str)` to avoid stripping valid falsey values like `0`. Always escape all 5 critical structural characters (`&`, `<`, `>`, `"`, `'`).
## 2024-06-13 - XSS Vulnerability in UI Component innerHTML Interpolation
**Vulnerability:** XSS via unescaped string interpolation in `.innerHTML` (in ModalManager) and Attribute Injection XSS via `textContent` anti-pattern (in VaultUI).
**Learning:** Using `div.textContent = text; return div.innerHTML` fails to escape quotes (`'` and `"`), allowing Attribute Injection. Components built with template literals into `.innerHTML` are highly vulnerable to XSS if variables like titles, error messages, and default values are not explicitly escaped.
**Prevention:** Always use explicit regex replacement to escape all 5 critical structural characters (`&`, `<`, `>`, `"`, `'`). Ensure all dynamically interpolated variables inside `.innerHTML` assignments are wrapped in an `escape()` function.
## 2024-11-20 - DOM-based XSS in window.open via dangerous protocols

**Vulnerability:** URLs stored in user entries and opened directly via `window.open` were vulnerable to DOM-based XSS via dangerous protocols like `javascript:`, `data:`, and `vbscript:`.

**Learning:** URL sinks like `window.open` and `<a href="..">` can execute arbitrary javascript code when passed dangerous URL schemes. They must be validated using the `URL` constructor to reject explicitly prohibited protocols. Bypasses such as spaced (`j a v a s c r i p t :`) protocols must be properly mitigated.

**Prevention:** Always validate URL protocols. Instead of basic regex blocks which are easily bypassed, strip control characters and spaces from a *copy* of the URL strictly for evaluating the protocol using `new URL(url, 'http://dummy.base')`. Reject protocols like `javascript:`, `data:`, `vbscript:`, and `file:`.
