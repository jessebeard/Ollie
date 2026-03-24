## 2026-03-24 - [Fix Hardcoded Salt]

**Vulnerability:** Hardcoded session salt and weak Math.random IDs in immutable-vault.js
**Learning:** PBKDF2 needs a random salt for each vault instance to prevent dictionary attacks. IDs should use secure entropy.
**Prevention:** Always generate a secure random salt and store it with the vault metadata. Use Web Crypto API for secure IDs.
