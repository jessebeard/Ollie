## 2024-06-07 - XSS attribute injection vulnerability in vault view escaping

**Vulnerability:** The custom `escape(str)` function in `VaultView` failed to replace single quotes (`'`) and could throw exceptions or fail entirely when processing non-string types or falsy numbers (like `0`). This could lead to HTML attribute injection (XSS) if single quotes are used, and potential app crashes or silently dropped values for valid inputs.

**Learning:** Regex-based escaping must explicitly cast inputs to a string, check for null/undefined instead of strict falsiness, and escape both types of quotes to prevent breakout from attribute contexts.

**Prevention:** Always use exhaustive escaping functions that cover `&`, `<`, `>`, `"`, and `'`. Ensure inputs are cast to string before calling `.replace()` and safely handle valid falsy values like `0` or `false`.
