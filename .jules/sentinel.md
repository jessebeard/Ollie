## 2024-05-22 - Quote Escaping in innerHTML vs textContent
**Vulnerability:** Attribute injection XSS via unescaped quotes.
**Learning:** Using DOM assignment (`div.textContent = str; return div.innerHTML;`) to escape strings for HTML interpolation correctly escapes `<`, `>`, and `&`, but fails to escape single `''` and double `""` quotes, leaving attribute values vulnerable. Also checking `if (!str)` drops valid `0` and `false` values.
**Prevention:** Always use robust regex-based escaping or explicit templating systems that handle quote escaping for attributes. Check for `null` specifically when escaping.
