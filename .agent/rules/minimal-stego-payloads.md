---
trigger: model_decision
description: minimal stego-payloads and strong array parsing
---

# Minimal Stego-Payloads & Strong Array Parsing (Format v4.1+)

1. **Positional Serialized Arrays (Tuples) Over Labeled JSON Objects**: All formats outside the stego payload itself (such as carrier manifests, chunk metadata, vault records, export envelopes, and container headers) as well as metadata embedded inside carriers must be serialized as compact positional arrays (tuples) of primitive values and sub-arrays. Labeled string-keyed JSON dictionary objects (`{ "key": "value" }`) are strictly prohibited in serialized wire, container, and carrier formats to eliminate semantic metadata leakage and string key bloat.
2. **Dedicated Schema-Enforcing Parsers (Unpackers)**: Because serialized positional arrays omit self-describing field names, every format must have paired `pack*()` serializer and `unpack*()` / `parse*()` parser functions. The parser must strictly validate:
   - Array length and shape.
   - Positional primitive types (e.g. index 0 is string, index 1 is integer).
   - Bounds and invariants (e.g. CRC-32 uint32 range, non-negative revisions, valid iteration counts).
   - Immediate fail-closed error return (`[null, Error]`) on any unexpected length, type mismatch, or out-of-bounds element before application code consumes the data.
3. **Zero Base64 Inside Carriers**: Binary ciphertext stripes and chunks must be stored directly as raw binary bytes within carrier envelopes. Never wrap binary data in Base64 or ASCII decimal arrays inside steganographic carriers.
4. **Binary Slice Framing**: Use native binary slice framing for stego-payloads:
   `[version: 1B = 41, carrierChecksum: 4B BE, metaLen: 2B BE, metaBytes, rawChunkBytes]`
   where `metaBytes` contains the UTF-8 encoded serialized positional metadata tuple, omitting labeled JSON objects.
5. **Strong Fail-Closed Carrier Parser**: The carrier parser must explicitly validate buffer length boundaries before calling `subarray()`, check version equality (`version === 41`), verify `metaLen` boundaries, and verify `carrierChecksum` (CRC-32) immediately.
