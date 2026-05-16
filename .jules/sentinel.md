## 2024-10-24 - Fix XSS Vulnerability in ModalManager
**Vulnerability:** XSS vulnerability in ModalManager methods due to unescaped dynamic inputs interpolated into innerHTML.
**Learning:** Dynamic input like title or message can contain malicious payload. Using innerHTML with unescaped input leaves it vulnerable to attribute injections and XSS.
**Prevention:** Always sanitize dynamic inputs by escaping HTML characters (like &, <, >, ", ') before injecting them into innerHTML.
