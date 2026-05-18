## 2024-05-18 - Prevent XSS in ModalManager

**Vulnerability:** XSS in ModalManager via unescaped string interpolation into `innerHTML` for various modal dialogues.
**Learning:** Using standard string interpolation with `.innerHTML` allows attackers to bypass UI restrictions if input is manipulated (e.g. `"><script>`).
**Prevention:** Implement an `escape(str)` function within ModalManager to sanitize title, label, message, and form values before interpolation.
