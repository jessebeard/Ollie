## 2024-05-10 - XSS Vulnerability in ModalManager via innerHTML Assignment
**Vulnerability:** DOM-based Cross-Site Scripting (XSS) in `ModalManager` where user-controlled strings (titles, labels, messages) were injected unescaped into `innerHTML`.
**Learning:** Even internal UI components must assume input strings can contain malicious markup if they originate from unsanitized sources (like vault entries or file metadata).
**Prevention:** Implement a robust `escapeHTML` method and enforce its use for all dynamic insertions into `innerHTML`, or prefer `.textContent` when feasible. Ensure multiline formatting is handled via CSS (`white-space: pre-wrap`) rather than `<br>` tags.
