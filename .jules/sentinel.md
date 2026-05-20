## 2024-05-20 - Missing Single Quote Escape in UI Interpolation
**Vulnerability:** XSS breakout vector in VaultView due to missing single quote (`'`) escaping in the `.escape()` function.
**Learning:** When escaping inputs for dynamic HTML string interpolation, missing single quotes allows attribute injections. Additionally, using `!str` to check for empty inputs incorrectly evaluates valid values like `0` or `false` as falsy, replacing them with an empty string.
**Prevention:** Always escape `'` (to `&#39;`) in addition to `&`, `<`, `>`, and `"`. Explicitly cast the input to a string using `String(str)` and use `if (str == null)` to handle null/undefined correctly while preserving 0 and false.
