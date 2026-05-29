## 2024-05-29 - Missing HTML Escaping in ModalManager
**Vulnerability:** XSS via unescaped string interpolation in `ModalManager.showForm`.
**Learning:** Raw string interpolation for dynamically rendering inputs (like `value="${val}"`) directly exposes components to attribute injection if structural characters (`"`, `<`, `>`) aren't escaped.
**Prevention:** Always implement an `escape()` utility and cast properties to strings to escape `&`, `<`, `>`, `"`, and `'` before injecting into DOM elements.
