## 2024-05-07 - Fix XSS in ModalManager

**Vulnerability:** DOM-based XSS in `app/components/vault/components/modal-manager.js`. User inputs were being directly interpolated into `innerHTML` strings in various methods (`prompt`, `confirm`, `showForm`, `showAlert`).
**Learning:** `innerHTML` allows execution of `<script>` tags and evaluation of other dangerous attributes if inputs aren't escaped. Additionally, when writing escaping methods, `if (!str)` removes valid inputs like `0` and `false`. `if (str == null)` is the correct approach to handle null/undefined without eating zeros.
**Prevention:** Always implement and use a robust `#escape` function for dynamic inputs inserted via `innerHTML`, and use Property-Based Testing (PBT) to assert that arbitrary strings do not break the escaping invariant.
