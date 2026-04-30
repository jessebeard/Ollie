## 2025-04-30 - Prevent Javascript execution in window.open

**Vulnerability:** The application was passing an unvalidated user-provided URL (`entry.url`) directly to `window.open(url, '_blank')`. This allowed arbitrary protocol schemes, such as `javascript:alert(1)`, enabling Cross-Site Scripting (XSS) if a user clicked the "Launch" button on a malicious entry.
**Learning:** `window.open` inherently trusts the provided URL string. In web environments, relying entirely on UI presentation escaping (like `escape(url)`) does not prevent malicious URI schemes from executing when invoked programmatically.
**Prevention:** Always parse untrusted URLs using the `URL` constructor and explicitly allowlist safe protocols (e.g., `http:`, `https:`) before using them in navigation contexts like `window.open`. Also, append `noopener,noreferrer` to prevent reverse tabnabbing attacks.
