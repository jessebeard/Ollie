## 2024-05-12 - Prevent XSS in ModalManager

**Vulnerability:** XSS vulnerability in `ModalManager` where user-controlled inputs were directly interpolated into `innerHTML` using template literals.

**Learning:** `innerHTML` executes arbitrary strings as HTML structure which is inherently unsafe unless all variables are reliably escaped. Even internal components that seem to only render application-provided string must consider user input vectors (e.g. prompt values).

**Prevention:** Always implement a reliable `#escape(str)` method when assigning dynamic data to `innerHTML` or use alternatives like `textContent`.
