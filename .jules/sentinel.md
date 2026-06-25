## 2024-11-20 - XSS vulnerabilities when non-strings and single quotes bypass escape routines
**Vulnerability:** The HTML escape function threw TypeErrors when given non-string values (like integers or booleans) because `.replace` is a String method, leading to component rendering failure and potential fallback attacks. Furthermore, single quotes were not escaped, allowing XSS in single-quote delimited attribute contexts.
**Learning:** Escape functions must be defensive and accept any primitive value securely without failing. In JS, `String(str)` explicitly casts values safely. Single quotes (`'`) must be escaped (`&#39;`) just as double quotes are.
**Prevention:** Always cast inputs in Regex-based HTML escape functions and check `if (str == null)` rather than `if (!str)` to avoid stripping valid falsey values like `0`. Always escape all 5 critical structural characters (`&`, `<`, `>`, `"`, `'`).
## 2024-06-13 - XSS Vulnerability in UI Component innerHTML Interpolation
**Vulnerability:** XSS via unescaped string interpolation in `.innerHTML` (in ModalManager) and Attribute Injection XSS via `textContent` anti-pattern (in VaultUI).
**Learning:** Using `div.textContent = text; return div.innerHTML` fails to escape quotes (`'` and `"`), allowing Attribute Injection. Components built with template literals into `.innerHTML` are highly vulnerable to XSS if variables like titles, error messages, and default values are not explicitly escaped.
**Prevention:** Always use explicit regex replacement to escape all 5 critical structural characters (`&`, `<`, `>`, `"`, `'`). Ensure all dynamically interpolated variables inside `.innerHTML` assignments are wrapped in an `escape()` function.
## 2024-06-25 - XSS Vulnerability in window.open execution
**Vulnerability:** User-provided URLs (like `javascript:alert(1)`) were being directly evaluated in `window.open(url, '_blank')` in the Vault component.
**Learning:** Browsers will execute code provided via `javascript:` and `data:` protocols within contexts like `window.open` or `<a href="...">`.
**Prevention:** Always sanitize URLs robustly before using them in sinks. To prevent evasions, strip non-printable characters (`\x00-\x1F\x7F`) prior to verifying the `.protocol` using the `URL` constructor. Provide a fallback base URL (`new URL(cleanUrl, 'http://dummy.base')`) to gracefully parse schemeless input without crashing.
