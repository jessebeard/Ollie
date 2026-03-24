## 2024-03-24 - Secure PRNG and Dynamic Salt Enhancement

**Vulnerability:** Weak PRNG (`Math.random()`) used for UUID generation and hardcoded salt ('ollie-session-salt-1234') used for deriving session keys.
**Learning:** Hardcoded salts and weak PRNG algorithms compromise cryptographic operations and lead to predictable identifiers or key derivation.
**Prevention:** Centralize ID generation using Web Crypto (`crypto.randomUUID()` or `crypto.getRandomValues()`) and dynamically generate and store cryptographic salts in metadata. Provide legacy fallbacks for backwards compatibility when changing cryptographic structures.
