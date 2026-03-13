# Ollie: Secure JPEG Steganography & Password Vault

**Ollie** is a secure, lightweight, and completely dependency-free application designed to manage and back up a password vault by hiding it directly inside standard JPEG images. By leveraging a custom-built JPEG codec, Ollie allows you to securely embed and extract encrypted keychain data within the frequency domain of your own photos—hiding your most sensitive information in plain sight.

---

## 🔒 Security & Scope

Ollie is built around a single, powerful premise: providing a secure and visually undetectable way to store and transmit your password vault. It is not a tool for malicious purposes; rather, it aims to let you dual-use your personal photo collection as a highly secure, distributed backup solution.

### Managed Complexity
The core strength of Ollie is that we built the **entire JPEG encoder and decoder from scratch** in pure JavaScript.

Instead of relying on black-box libraries or heavyweight WebAssembly ports, Ollie manages the immense complexity of image compression internally. This gives us absolute, low-level control over the Discrete Cosine Transform (DCT) coefficients—the exact place where data needs to be hidden. This architectural choice ensures that the steganography process is deeply integrated, fast, and secure.

### Current Implementation State
Ollie is currently fully functional as a steganography-based password vault. The active features include:
- **Password Vault Interface:** A clean, modern UI (`app/vault.html`) for managing your passwords, generating strong keys, and securely locking your vault.
- **Batch Embedding & Extraction:** The ability to shard and distribute your encrypted vault data across multiple JPEG files seamlessly.
- **Pure JavaScript Steganography Engine:** A robust, dependency-free codec that manipulates DCT coefficients without noticeably degrading image quality.
- **Rigorous Test Coverage:** Ollie uses strict Test-Driven Development (TDD) principles to ensure the steganography engine is mathematically sound and reliable.

---

## ▶️ Getting Started

Ollie runs entirely in your browser with zero external dependencies. The primary interface is the password vault.

1. Open **`app/vault.html`** in a modern web browser.
2. Follow the UI instructions to create a new vault or unlock an existing one hidden within your uploaded JPEG images.

---

## 🧪 Testing and Reliability

Data security is the maximum priority of Ollie, and ensuring the reliability of the steganography engine is critical. We maintain a very comprehensive test suite.

### Run tests in Node.js
```bash
npm test
```

### Run tests in the Browser
Open **`app/test.html`** to run the complete suite with a visual test runner interface.

---

## 🚀 Aspirational Goals & Roadmap

Ollie is actively evolving. While the core password vault and steganography engine are functional, our constitution outlines several advanced features and goals we are working toward:

- **Advanced Error Correction:** Implementing robust Reed-Solomon error correction to protect hidden data against corruption or minor image alterations.
- **Broader Utility:** Expanding the steganography container format to support arbitrary data storage and a secure messaging system, not just the password vault.
- **Rust Implementation:** Utilizing the current pure JavaScript engine as a testbed to build a highly optimized Rust implementation of the same functionality.
