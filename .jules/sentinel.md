## 2024-03-05 - Missing XSS Character and Type Casting in UI Escape
**Vulnerability:** VaultView.escape() was vulnerable to attribute injection (missing single quote escaping) and TypeErrors on non-string inputs.
**Learning:** Using purely !str for validation can strip valid inputs like `0` or `false`, and .replace without explicit String() casting causes exceptions. Quotes must be comprehensively escaped.
**Prevention:** Always use `if (str == null) return '';` and `String(str)` before running regex replacements, explicitly including `&`, `<`, `>`, `"`, and `'`.
