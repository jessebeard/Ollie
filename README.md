# Ollie

**Ollie** is a secure, lightweight, dependency-free tool designed to help you safely proliferate and back up your password vault (keychain) by embedding it directly inside seemingly benign JPEG images. Hide your most important data in plain sight!

Ollie is not a tool for malicious purposes; it is a privacy tool designed to help keep your data safe, in your own hands, and hidden in plain sight.

---

## ✨ Features

- **Built-in Password Vault:** A clean, modern, and easy-to-use interface for managing your keychain, securely backed by image steganography.
- **Maximum Data Security:** Your keychain's safety is our absolute priority, ensuring secure storage and transmission.
- **Robust Error Handling:** Features built-in error correction (Reed-Solomon) and detection to protect your hidden data against corruption.
- **Multi-Purpose Storage:** Beyond the password vault, Ollie also supports a secure messaging system and arbitrary data storage.
- **Test-Driven Reliability:** Ollie is built using strict Test-Driven Development (TDD) principles, featuring an incredibly strong and comprehensive test suite to guarantee reliability.
- **Modular & Hackable:** Designed to be understandable, easy to read, and easy to modify. It is not a black box!

---

## ▶️ Usage

The primary entry point for Ollie is the password vault UI.

1. Open **`app/vault.html`** in a modern web browser.
2. Follow the on-screen instructions to create or open a vault hidden within a JPEG image.

---

## 🧪 Testing

Ollie is rigorously tested. We strongly believe in Test-Driven Development (TDD) and maintaining high code quality. The comprehensive test suite covers all components from the steganography engine to the password vault internals.

### Node.js Testing
Run the complete test suite from the command line:
```bash
npm test
```

### Browser Testing
Open **`app/test.html`** in a browser to run the full test suite with a visual interface.

---

## 📖 History & Technical Background

Originally, Ollie began as an educational and practical **Pure JavaScript JPEG Codec**. This custom, dependency-free codec is the foundational technology that powers Ollie's advanced steganography capabilities today.

Because we wrote the JPEG encoder and decoder from scratch, Ollie has complete, low-level control over the **Discrete Cosine Transform (DCT)** frequency coefficients. This allows us to embed your encrypted vault data directly into the frequency domain of the image, making it highly secure and undetectable to the naked eye.

### Steganography Engine Highlights:
- **Pure JavaScript:** No native modules, no WebAssembly, no heavyweight dependencies.
- **Container Format:** Structured metadata format for storing encrypted data with versioning.
- **Multi-File Splitting:** The ability to shard data across multiple JPEG files with reassembly support.
- **Full JPEG Codec:** Complete encoder (RGBA → JPEG) and decoder (JPEG → RGBA) implementing Baseline Sequential DCT.

### Future Goals
Ollie currently serves as a functional application and a test bed for a planned **Rust implementation** of the same steganography functionality.
