## 2024-04-22 - [Insecure Randomness in UUID Generation]
 **Vulnerability:** Cryptographically insecure ID generation using Math.random().
 **Learning:** Insecure functions like Math.random() can lead to predictable IDs and potential collision vulnerabilities.
 **Prevention:** Always use the Web Crypto API (crypto.randomUUID()) for security-sensitive unique identifier generation.
