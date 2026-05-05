
## 2025-02-27 - XSS in ModalManager

**Vulnerability:** Cross-Site Scripting (XSS) in UI Modals due to dynamically generated HTML inserting unescaped user-input values like `title`, `label`, `message`, and `field.name` via `element.innerHTML = ...`.

**Learning:** Developers relied on JS template literals directly within `innerHTML` block assignments without encoding the interpolations, leaving the UI highly vulnerable to executing scripts when processing malicious entries.

**Prevention:** Never use direct injection of unsanitized strings in `innerHTML`. Implement a robust `escape(str)` function locally inside UI components manipulating `innerHTML` manually. Prefer property-based assignments like `.textContent` where possible.
