## 2024-11-20 - XSS vulnerabilities when non-strings and single quotes bypass escape routines
**Vulnerability:** The HTML escape function threw TypeErrors when given non-string values (like integers or booleans) because `.replace` is a String method, leading to component rendering failure and potential fallback attacks. Furthermore, single quotes were not escaped, allowing XSS in single-quote delimited attribute contexts.
**Learning:** Escape functions must be defensive and accept any primitive value securely without failing. In JS, `String(str)` explicitly casts values safely. Single quotes (`'`) must be escaped (`&#39;`) just as double quotes are.
**Prevention:** Always cast inputs in Regex-based HTML escape functions and check `if (str == null)` rather than `if (!str)` to avoid stripping valid falsey values like `0`. Always escape all 5 critical structural characters (`&`, `<`, `>`, `"`, `'`).
## 2025-02-12 - ModalManager XSS Vulnerability

**Vulnerability:** XSS injection was possible through dynamically rendered modals (`prompt`, `confirm`, `showForm`, `showAlert`) in `app/components/vault/components/modal-manager.js` because user-supplied input was concatenated directly into `innerHTML` without escaping.
**Learning:** `innerHTML` inherently executes embedded HTML tags when assigning structural markup dynamically. Native DOM APIs like `createElement` + `textContent` securely escape input by default, whereas template literals do not.
**Prevention:** Avoid concatenating raw user input directly into HTML template literals meant for `innerHTML`. Always map user inputs through a robust `escape` method (replacing `&`, `<`, `>`, `"`, `'` with HTML entities) prior to embedding.
