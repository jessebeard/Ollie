## 2024-06-01 - Prevent XSS in ModalManager

**Vulnerability:** ModalManager renders modal dynamically via `innerHTML = \`...\``, passing user-provided strings like titles, messages, or tags directly into the HTML without escaping, which causes Cross-Site Scripting (XSS).
**Learning:** Raw dynamic string interpolation inside `innerHTML` fails to handle structural HTML characters, allowing attackers to inject `script` tags, image `onerror` events, etc.
**Prevention:** Explicitly cast to strings and escape inputs containing `&`, `<`, `>`, `"`, and `'` characters using a dedicated `escapeHtml` or `escape` function before inserting into HTML templates.
