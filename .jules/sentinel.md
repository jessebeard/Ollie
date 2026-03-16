## 2024-05-15 - Insecure ID Generation

**Vulnerability:** Used `Math.random()` for generating vault entry IDs and chunk IDs.

**Learning:** `Math.random()` is not cryptographically secure, leading to predictable IDs and possible collisions or ID guessing.

**Prevention:** Always use Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) for generating unique IDs or tokens instead of insecure alternatives.
