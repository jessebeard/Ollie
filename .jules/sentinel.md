## 2024-11-20 - XSS vulnerabilities when non-strings and single quotes bypass escape routines
**Vulnerability:** The HTML escape function threw TypeErrors when given non-string values (like integers or booleans) because `.replace` is a String method, leading to component rendering failure and potential fallback attacks. Furthermore, single quotes were not escaped, allowing XSS in single-quote delimited attribute contexts.
**Learning:** Escape functions must be defensive and accept any primitive value securely without failing. In JS, `String(str)` explicitly casts values safely. Single quotes (`'`) must be escaped (`&#39;`) just as double quotes are.
**Prevention:** Always cast inputs in Regex-based HTML escape functions and check `if (str == null)` rather than `if (!str)` to avoid stripping valid falsey values like `0`. Always escape all 5 critical structural characters (`&`, `<`, `>`, `"`, `'`).
## 2024-06-13 - XSS Vulnerability in UI Component innerHTML Interpolation
**Vulnerability:** XSS via unescaped string interpolation in `.innerHTML` (in ModalManager) and Attribute Injection XSS via `textContent` anti-pattern (in VaultUI).
**Learning:** Using `div.textContent = text; return div.innerHTML` fails to escape quotes (`'` and `"`), allowing Attribute Injection. Components built with template literals into `.innerHTML` are highly vulnerable to XSS if variables like titles, error messages, and default values are not explicitly escaped.
**Prevention:** Always use explicit regex replacement to escape all 5 critical structural characters (`&`, `<`, `>`, `"`, `'`). Ensure all dynamically interpolated variables inside `.innerHTML` assignments are wrapped in an `escape()` function.
## 2024-11-20 - DOM-based XSS in window.open

**Vulnerability:** The application takes user-controlled `entry.url` values and passes them directly to `window.open` within the VaultView `btn-launch` click handler without any sanitization. This allowed attackers to use malicious protocols like `javascript:`, `vbscript:`, and `data:` to execute arbitrary code (XSS).

**Learning:** Sinks like `window.open()` or `<a href="...">` natively execute `javascript:` and other malicious URI handlers. Direct use of user-provided URLs in these sinks creates XSS vulnerabilities. Attackers often use spaces or non-printable control characters to bypass string checks.

**Prevention:** Always robustly sanitize URLs before passing them to a sink: strip non-printable control characters that bypass string checks, and use the `URL` constructor to explicitly validate and reject dangerous `.protocol` values. Apply aggressive space-stripping (`/[\x00-\x20\x7F]/g`) to a separate copy of the URL solely for `URL` constructor protocol validation, while only stripping non-printable characters from the final URL so unencoded spaces are not corrupted.
