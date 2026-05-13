
## 2024-05-14 - Prevent XSS in ModalManager via innerHTML escaping

**Vulnerability:** XSS vulnerability in `ModalManager` where user-controlled inputs (like passwords or usernames in the vault) were unsafely injected into the DOM via template literals passed to `.innerHTML` in prompt, confirm, form, and alert modals.
**Learning:** This existed because the custom `ModalManager` manually constructed HTML strings without escaping the variables. The developers likely overlooked this because standard modern frameworks handle escaping automatically. Empty or falsy values like `0` or `false` must also be handled correctly by escaping utilities without being dropped.
**Prevention:** Always escape dynamic values before using them in `.innerHTML` interpolations. An `#escapeHTML` method must be applied to all user-controlled data placed into HTML strings, and automated Property-Based Tests (PBT) should ensure no malicious inputs (like `<script>`) can bypass the escaping logic.
