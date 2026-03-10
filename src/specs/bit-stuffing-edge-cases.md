# JPEG Bit-Stuffing & Stream Edge Cases

This document serves as a knowledge store for critical edge cases regarding the JPEG specification, bit-packing, byte-stuffing, and stream limits. It is designed to catalog non-obvious boundary conditions discovered during the implementation and fuzzing of the `BitWriter` and `BitReader`.

## 1. Byte-Alignment Before Markers (The `BitWriter` Padding Bug)

**The Rule:** 
When the entropy-coded scan data (DCT coefficients) is interrupted by a Restart Marker (`RSTn`, `0xFFD0` through `0xFFD7`), the active bitstream must be padded to the current byte boundary using `1`s.

**The Edge Case:**
If the stream is at an offset where adding `1`s happens to complete a full byte of exactly `11111111` (i.e. `0xFF`), standard JPEG Data Byte-Stuffing normally dictates that the encoder must subsequently inject a `0x00` literal byte to prevent the decoder from interpreting the `0xFF` as a marker.
*However*, because this `0xFF` was generated dynamically as *padding immediately preceding a structural marker*, **it must NOT be byte-stuffed.**
If the encoder blindly stuffs `0xFF` -> `0xFF 0x00` before emitting the `0xFFD0` RST marker, the decoder interprets the `0x00` as invalid stream data, destroying the synchronization of the MCU blocks.

**The Fix:**
When calling `BitWriter.alignByte()`, an explicit `disableStuffing` flag must be set to `true` whenever aligning directly in preparation for a native JPEG marker emission.

## 2. The EOF "Swallowed Bits" Lookahead Trap (`peek16Bits`)

**The Rule:**
If a JPEG stream unexpectedly ends (EOF) before a symbol is completed—such as when the file is truncated, or when reading the absolute final bits of the `SOS` segment before the `EOI` marker—the JPEG specification dictates that any non-existent, trailing bits required to complete the symbol **must be parsed as `1`s**. 

**The Edge Case:**
Huffman decoding heavily relies on fetching `16`-bit lookaheads (`peek16Bits`) to quickly pattern-match the next symbol without committing to stream consumption. 
If the stream is at the very final byte, and that byte happens to be a stuffed representation (`0xFF 0x00`), the `BitReader` correctly discards the `0x00` and extracts the final valid data bits from `0xFF`.
However, if the lookahead function detects that it reached EOF with only `4` valid bits mathematically remaining in the buffer, a naive loop may prematurely `break` or `throw` an `EOF Error`.
If the lookahead function catches that EOF error and defaults to padding the remaining `12` bits of the lookahead integer with `0`s (e.g. `1111 000000000000`), the Huffman table will fundamentally misinterpret the final bits of the image. For AC magnitude coefficients, this often mutates a negative value into a drastically different positive value (e.g. interpreting a `-2` as a `1`), irreparably corrupting the final MCU blocks.

**The Fix:**
Lookahead functions like `peek16Bits` must physically count exactly how many valid bits were successfully extracted before hitting the EOF marker/error. They must then explicitly bit-shift and apply a mathematical bitwise-OR mask of `1`s to forcefully pad out the requested integer length (e.g. `value = (value << remaining) | ((1 << remaining) - 1)`).

## 3. The Stuffed Byte Zero-Boundary Trap (`peek16Bits`)

**The Rule:**
To prevent arbitrary file data from matching reserved JPEG segment markers (like `0xFFD0`), any `0xFF` byte generated from compressed data must be immediately followed by a `0x00` "stuffed" byte. Decoders must recognize and discard this `0x00` byte.

**The Edge Case:**
The fast-path `peek16Bits` algorithm attempts to leap forward 16 bits (2 bytes) mathematically when the `bitOffset` is exactly `0`.
If the bit offset naturally lands on `0` *exactly* on the padded byte boundary (i.e. the read cursor is on the `0x00` stuffed byte because the previous 8 bits consumed the `0xFF` byte), an optimized lookahead algorithm might erroneously observe only the `bitOffset === 0` state without looking into the *past*.
By failing to verify that `data[byteOffset - 1] === 0xFF`, the algorithm blindly consumes the `0x00` stuffed byte as 8 physical bits of coefficient data `00000000`. This fatally shifts the entire rest of the image bitstream forward by 8 bits, causing total Huffman tree desynchronization and massive trailing coefficient corruption.

**The Fix:**
Even fast-path lookahead functions must defensively check the preceding byte when starting exactly on a byte boundary. If `byteOffset > 0` and `data[byteOffset - 1] === 0xFF` and `data[byteOffset] === 0x00`, the algorithm must advance `byteOffset++` before consuming physical bit data.

## 4. PBT Shrinking the Swallowed Tail
Property-Based Testing (PBT) proved that these edge conditions are completely data-dependent. Testing generic images is insufficient because the probability of the *final* coefficient exactly resulting in a padded `0xFF` state is mathematically low. Aggressive fuzzing with a `restartInterval` enabled is required to forcibly synthesize thousands of artificial stream boundaries (RST markers) to surface these bit-level misalignments.
