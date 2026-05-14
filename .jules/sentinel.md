## 2024-05-14 - ModalManager XSS Vulnerability

**Vulnerability:** The `ModalManager` component directly interpolates user input (such as `initialValues` in forms, messages in `confirm`, `prompt`, and `showAlert`) into HTML strings assigned to `innerHTML` without any sanitization or escaping.

**Learning:** This exposes the application to Cross-Site Scripting (XSS) when displaying untrusted data, such as records loaded from the vault that may contain malicious payloads in fields like `username`, `notes`, or `title`.

**Prevention:** Always escape dynamic values before inserting them into HTML templates using a robust HTML escaping function, or assign text securely using `textContent`.
