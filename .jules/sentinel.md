## 2024-05-18 - Insecure ID generation using Math.random

**Vulnerability:** Weak randomness using Math.random for generating IDs. This can lead to collisions or predictability.

**Learning:** Math.random is cryptographically insecure and shouldn't be used for generating IDs that are used as keys in secure systems.

**Prevention:** Use crypto.randomUUID() or crypto.getRandomValues() for generating random IDs.
