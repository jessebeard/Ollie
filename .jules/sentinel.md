## 2024-11-20 - XSS vulnerabilities when non-strings and single quotes bypass escape routines
**Vulnerability:** The HTML escape function threw TypeErrors when given non-string values (like integers or booleans) because `.replace` is a String method, leading to component rendering failure and potential fallback attacks. Furthermore, single quotes were not escaped, allowing XSS in single-quote delimited attribute contexts.
**Learning:** Escape functions must be defensive and accept any primitive value securely without failing. In JS, `String(str)` explicitly casts values safely. Single quotes (`'`) must be escaped (`&#39;`) just as double quotes are.
**Prevention:** Always cast inputs in Regex-based HTML escape functions and check `if (str == null)` rather than `if (!str)` to avoid stripping valid falsey values like `0`. Always escape all 5 critical structural characters (`&`, `<`, `>`, `"`, `'`).

## 2024-11-20 - Unescaped ModalManager XSS
**Vulnerability:** The `ModalManager` component dynamically interpolates variables (like titles, labels, messages) directly into `innerHTML` strings. If these inputs contain structural HTML characters (like `<script>`), it leads to DOM-based XSS.
**Learning:** Components constructing DOM nodes via string interpolation are highly susceptible to XSS.
**Prevention:** Always explicitly sanitize inputs using a robust escape method before interpolation into `innerHTML`.
