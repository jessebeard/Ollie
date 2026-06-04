## 2024-06-04 - XSS in ModalManager
**Vulnerability:** ModalManager renders unsanitized inputs into innerHTML (title, label, message, input values)
**Learning:** Developers often forget to escape variables passed into template literals for innerHTML, especially in custom UI components.
**Prevention:** Add a centralized escape function to the class and wrap all variable interpolations in template literals with it. Ensure it escapes quotes, tags, and ampersands.
