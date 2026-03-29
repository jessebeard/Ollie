## 2024-05-24 - [Title]
**Vulnerability:** [What you found]
**Learning:** [Why it existed]
**Prevention:** [How to avoid next time]
## 2024-05-24 - Math.random() usage for IDs
**Vulnerability:** Weak unpredictability when generating unique IDs.
**Learning:** Avoid using non-cryptographically secure random functions for system IDs.
**Prevention:** Always use `crypto.randomUUID()` or `crypto.getRandomValues()`.
