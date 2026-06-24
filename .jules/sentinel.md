## 2024-11-20 - XSS vulnerabilities when non-strings and single quotes bypass escape routines
**Vulnerability:** The HTML escape function threw TypeErrors when given non-string values (like integers or booleans) because `.replace` is a String method, leading to component rendering failure and potential fallback attacks. Furthermore, single quotes were not escaped, allowing XSS in single-quote delimited attribute contexts.
**Learning:** Escape functions must be defensive and accept any primitive value securely without failing. In JS, `String(str)` explicitly casts values safely. Single quotes (`'`) must be escaped (`&#39;`) just as double quotes are.
**Prevention:** Always cast inputs in Regex-based HTML escape functions and check `if (str == null)` rather than `if (!str)` to avoid stripping valid falsey values like `0`. Always escape all 5 critical structural characters (`&`, `<`, `>`, `"`, `'`).
## 2024-06-13 - XSS Vulnerability in UI Component innerHTML Interpolation
**Vulnerability:** XSS via unescaped string interpolation in `.innerHTML` (in ModalManager) and Attribute Injection XSS via `textContent` anti-pattern (in VaultUI).
**Learning:** Using `div.textContent = text; return div.innerHTML` fails to escape quotes (`'` and `"`), allowing Attribute Injection. Components built with template literals into `.innerHTML` are highly vulnerable to XSS if variables like titles, error messages, and default values are not explicitly escaped.
**Prevention:** Always use explicit regex replacement to escape all 5 critical structural characters (`&`, `<`, `>`, `"`, `'`). Ensure all dynamically interpolated variables inside `.innerHTML` assignments are wrapped in an `escape()` function.

## 2024-06-24 - DOM XSS via Unsanitized URL Protocol in VaultView
**Vulnerability:** User-provided URLs in `VaultView` components were directly assigned to `data-url` attributes and executed in `window.open(url)` without verifying the URL protocol. This permitted `javascript:`, `data:`, and `vbscript:` payloads to execute arbitrary JavaScript.
**Learning:** `window.open` and attribute injection via template literals are notorious sinks for DOM-based XSS when URL protocols are not strictly validated, since browsers natively support code execution via non-HTTP protocols.
**Prevention:** Always parse and validate user-supplied URLs using the native `URL` API (with a dummy base to handle relative URLs) and ensure the `.protocol` property is not in an explicit denylist before utilizing it in an execution context.
