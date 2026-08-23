optimized,bit-writer} class+methods); src/automata/parsers/marker-scanner.js (MARKERS const)
- Category: Style and Consistency
- Detail: Multiple exported functions/methods and one exported const lack the required typed @param/@returns JSDoc (rule: typed JSDoc mandatory on every exported function). assembleImage's @returns is factually wrong (it returns Result tuples, not a {data,width,height} object). Fix: add/complete typed JSDoc on all listed exports and correct assembleImage's @returns.

### [LOW] Dead code (rule #9) â€” zero usages in src/ and test/
- File: src/automata/parsers/spiff-parser.js (L39 SPIFF_COLOR_SPACES, L53 SPIFF_COMPRESSION_TYPES, L63 SPIFF_RESOLUTION_UNITS); src/automata/bit-streams/bit-reader.js (L21) + src/automata/bit-streams/bit-reader-optimized.js (L60-68) (_handleByteStuffing, public, no external callers); src/codec/decoder.js (~L306 per-component `dcPredictor` field, never read)
- Category: Style and Consistency
- Detail: The three SPIFF constant exports, the public _handleByteStuffing methods, and the per-component `dcPredictor` field are never referenced anywhere in src/ or test/. Rule #9 prohibits dead code. Fix: delete them (the live predictor state is the local `dcPredictors` array at decoder.js L329).

### [LOW] Encoder lacks input validation and has several truncation/hack issues
- File: src/codec/encoder.js (encode entry â€” no width/height/data.length validation; writeWord >65535 truncation; assembleFile header value >255 wraps mod 256; writeDHT L670 `dcCounts.slice(1)` hack; L426-427 `compIds.length < 3` â†’ console.warn only â†’ `coefficients[undefined]` TypeError)
- Category: Style and Consistency
- Detail: encode() accepts arbitrary width/height/data.length with no validation (possible OOM/NaN/hang); writeWord silently truncates values >65535; assembleFile wraps a >255 header value mod 256; the `slice(1)` in writeDHT is a fragile off-by-one hack; and the <3-component case only warns, then indexes `coefficients[undefined]` â†’ uncaught TypeError. Fix: validate inputs at the encode() boundary, range-check write values, and return tuple errors for the <3-component case.

### [LOW] Miscellaneous consistency / robustness nits
- File: src/codec/encoder.js + src/codec/decoder.js (L244-245) (console.log spam); src/codec/capacity-scanner.js (queue.shift() O(nÂ²); concurrency â‰¤0 â†’ zero workers â†’ silently zeroed result); src/automata/bit-streams/bit-reader-optimized.js (L46-58 "Optimized" naming misleading; alignToByte has no bounds check); src/codec/decoder.js (L456-636 assembleImage return shape inconsistent â€” `coefficients` field present only in multi-comp path); src/codec/file-scanner.js (matchesPattern JSDoc claims "Glob pattern" but only supports `*.*`/`*`/`*.ext`/exact); src/automata/parsers/spiff-parser.js (typo "Modified Modified READ"; SPIFF width/height are Uint32 with no range validation); src/automata/bit-streams/bit-writer.js (writeBits no length validation; flush returns bare); src/codec/transcoder.js (drops DRI/chromaSubsampling on re-encode)
- Category: Idiomatic Improvements
- Detail: Non-security hygiene issues that will bite later: log spam on error paths, O(nÂ²) queue and a silently-degenerate concurrencyâ‰¤0 config in capacity-scanner, a misleadingly-named "optimized" bit reader whose alignToByte is unbounded, an inconsistent assembleImage return shape, an over-promising JSDoc on file-scanner, an unvalidated SPIFF dimension field, unvalidated BitWriter writes, and a transcoder that silently drops DRI/chroma subsampling metadata. Fix: remove log spam, use an index-based queue and validate concurrencyâ‰¥1, rename or bound the optimized reader, standardize the decode return shape, correct the JSDoc, range-validate SPIFF dims, validate writeBits length, and preserve DRI/chromaSubsampling in transcode.

## Coverage Gaps
Files/functions in scope with no direct test coverage:
- src/codec/file-scanner.js â€” no test imports it at all (scanDirectory, matchesPattern untested).
- src/automata/parsers/spiff-parser.js â€” no dedicated module test; spiff-parsing.test.js exercises SPIFF only at decoder level.
- src/automata/bit-streams/bit-reader-optimized.js â€” only test/utils/compare-bitreaders.js and compare-skipbits.js, both outside the suite; its throw paths (L16/L24/L32/L38/L42-44) are never asserted.
- src/automata/bit-streams/bit-writer.js â€” only exercised indirectly via huffman-encoder-fsm.test.js.

Untested malicious-input cases:
- Truncated scan / bit underflow at the decode() boundary (defensive.test.js contains only PNG-magic and empty/null cases).
- DHT with a DC code mapped to category 17-255 (the readBits throw path, huffman-decoder-fsm.js L27).
- Non-canonical or overfull DHT BITS (silent lookup-table corruption, huffman-optimized-fsm.js / dht-automaton.js).
- DQT Pq=1 with high byte â‰¥0x80 (sign bug, dqt-automaton.js L51); zero quantizer values; truncated Pq=1 payload.
- DRI payload <2 bytes (decoder.js L167 RangeError).
- JFIF APP0 payload 5-13 bytes (decoder.js L132-133 RangeError).
- SOF with duplicate component ids; SOF expectedLength trailing garbage (uses `<`).
- SOS with Ss>Se; baseline SOS with Ah=0 and Al=0; SOS component selectors not matching SOF.
- RST number mismatch / wrong bit position / resync failure (rst-markers.test.js is a single own-encoder round-trip PBT only).
- 0xFF 0xFF sequence inside scan data (bit-core.js L16-27 fallthrough).
- Mid-readBits truncation and 1s-padded EOF peek16Bits (bit-core.js L121, L127-131).
- Encoder with |AC coefficient| â‰¥ 1024 or |DC difference| â‰¥ 2048 via transcoder (huffman-encoder-fsm.js L83/L114 TypeError paths).
- capacity-scanner with concurrency â‰¤ 0.
- test/utils/bit-reader.test.js content never audited for EOF/invalid-length throw coverage.
