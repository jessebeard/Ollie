F5 Steganography — Corrected Reference Specification (v1.2, Plain-Text Safe)

This file contains:

Overview

Key definitions

Corrected algorithm details

Embedding specification

Extraction specification

Pseudocode (embed + extract)

Known-good F5 vectors (synthetic)

Test cases

Everything is plain text. No special math formatting.

1. Overview

F5 is a JPEG steganography algorithm that embeds data into JPEG AC coefficients while minimizing changes and spreading them uniformly.
It uses:

Matrix Encoding: hides k bits in a group of n = (2^k - 1) non-zero AC coefficients using at most one change.

Permutative Straddling: pseudo-randomly permutes the visit order of AC coefficients so that embedding is statistically uniform.

Shrinkage Handling: if a modification turns a coefficient ±1 into 0, the group must be discarded and re-embedded in the next group.

This reference specification corrects common mistakes around permutation and shrinkage.

2. Key Terminology

AC coefficients: quantized DCT coefficients (except DC) extracted during JPEG entropy decode.

Non-zero coefficients: only non-zero AC coefficients are eligible for groups.

k: number of bits stored per group.

n: group size = (2^k - 1).

Syndrome (S): XOR-hash over indices of odd-valued coefficients.

Message chunk (M): the k-bit integer extracted from the message.

Difference (d): d = S XOR M. Value in range 0 .. n.

If d == 0: no modification.
If d != 0: modify the coefficient at group index (d - 1).

Coefficient modification rule:
If c > 0: c = c - 1
If c < 0: c = c + 1
(c = 0 never appears inside a valid group)

Shrinkage: When modification turns ±1 into 0.

Permutation: A Fisher–Yates shuffle of indices 0..N-1, where N is number of AC coefficients.
Important: permutation depends only on N and the key, not on coefficient values.

3. Corrected Logic Summary

Entropy-decode JPEG to get AC coefficient array A.

Generate permutation P over indices 0..N-1.

Walk P in that order, skipping zeros, forming groups of n non-zero coefficients.

Compute syndrome S.

Compare with message chunk M.

If needed, modify exactly one coefficient.

If modification causes shrinkage (value becomes 0), the entire group is discarded and the same message chunk is retried starting at the next coefficients.

Re-encode coefficients.

Key correction: Shrinkage DOES NOT change permutation order. The embedder simply continues scanning P from where it left off.

4. Embedding Specification
4.1 Capacity Estimate

Capacity approx = (non_zero_count / (2^k - 1)) * k.

Shrinkage reduces usable capacity. Expect loss of roughly 25–50 percent of possible 1-valued coefficients.

4.2 Embedding Steps

Decode JPEG → AC coefficient array A.

Compute N = len(A).

Generate permuted index list P of length N.

Choose k so that capacity >= message length.

Set group size n = (2^k - 1).

For each message chunk of k bits:

Collect next n non-zero AC coefficients in permuted order.

Compute syndrome S: XOR of indices (1-based inside group) of coefficients whose absolute value is odd.

Convert message chunk to integer M.

Compute d = S XOR M.

If d != 0, modify coefficient at index (d - 1) inside the group by decreasing magnitude.

If the modified coefficient becomes 0 (shrinkage), discard this group (do not advance message pointer).

Otherwise, message pointer advances by k.

Re-encode JPEG.

5. Extraction Specification

Extraction mirrors embedding:

Decode JPEG → AC array A.

Generate same permutation P with same key and same N.

Set group size n = (2^k - 1) and know expected message size externally.

Walk through P:

Skip zeros.

Collect n non-zero coefficients.

Compute syndrome S.

Recover k message bits from the integer S.

Concatenate bits to reconstruct original message.

Extractor does not know where shrinkage occurred; groups simply contain only actual non-zero coefficients.

6. Pseudocode (Plain Text)
6.1 Embedding Pseudocode
function F5_Embed(ac_array, message_bits, password):
    N = length(ac_array)
    P = generate_permutation(N, password)

    nonzeros = count_nonzero(ac_array)
    k = choose_k(nonzeros, length(message_bits))
    n = (2^k) - 1

    msg_idx = 0
    perm_idx = 0

    while msg_idx < length(message_bits):

        group_indices = []
        group_values = []

        # Collect n non-zero coefficients
        while length(group_indices) < n:
            if perm_idx >= N:
                error("Capacity exceeded")

            idx = P[perm_idx]
            perm_idx = perm_idx + 1

            val = ac_array[idx]
            if val != 0:
                append group_indices with idx
                append group_values with val

        # Compute message chunk M
        chunk = message_bits[msg_idx : msg_idx + k]
        if length(chunk) < k:
            pad with zeros
        M = bits_to_int(chunk)

        # Compute syndrome S
        S = 0
        for i in range(0, n):        # i is 0-based here
            if abs(group_values[i]) mod 2 == 1:
                S = S XOR (i + 1)    # i+1: 1-based index inside group

        d = S XOR M

        if d == 0:
            msg_idx = msg_idx + k
            continue

        # Modify coefficient at index (d - 1)
        target_idx = group_indices[d - 1]
        old = ac_array[target_idx]

        if old > 0:
            new = old - 1
        else:
            new = old + 1

        ac_array[target_idx] = new

        # Check shrinkage
        if new != 0:
            msg_idx = msg_idx + k
        # else: do nothing; retry same message chunk

    return ac_array

6.2 Extraction Pseudocode
function F5_Extract(ac_array, password, k, output_bit_length):
    N = length(ac_array)
    P = generate_permutation(N, password)
    n = (2^k) - 1

    result_bits = []
    perm_idx = 0

    while length(result_bits) < output_bit_length:

        group_values = []

        # collect n non-zero coefficients
        while length(group_values) < n:
            if perm_idx >= N:
                error("Unexpected end of coefficients")

            idx = P[perm_idx]
            perm_idx = perm_idx + 1

            val = ac_array[idx]
            if val != 0:
                append group_values with val

        # compute syndrome S
        S = 0
        for i in range(0, n):
            if abs(group_values[i]) mod 2 == 1:
                S = S XOR (i + 1)

        # S is the recovered k-bit integer
        recovered_bits = int_to_bits(S, k)
        append recovered_bits to result_bits

    return result_bits[0:output_bit_length]

7. Known-Good F5 Vectors (Synthetic)

These are deterministic sequences designed to verify an implementation.
They do not depend on JPEG content and can be used to confirm correctness of matrix encoding, shrinkage handling, and permutation logic.

Vector 1 — Minimal example, no shrinkage
Input AC coefficients:
  [ 3, -2, 5, 4, -3, 6, 7, -5, 2, ... ]

Permutation P (seed = "key", N=10):
  [ 4, 1, 7, 0, 3, 2, 5, 6, 8, 9 ]

Choose k = 2 → n = 3

Message bits: 1 0 (binary 2)
Expected S of first group: 1
d = S xor M = 1 xor 2 = 3
Modify coefficient group index (3 - 1) = 2

Expected modified coefficient:
  c2 decreases by magnitude: 5 -> 4

Expected output coefficients at those indices:
  [ 3, -2, 4, 4, -3, ... ]

Vector 2 — Shrinkage case
Group values: [1, -3, -1]
k = 2 → n = 3
Message bits = 1 0  (M = 2)

Compute S:
  c1 = 1 (odd) → contribute index 1
  c2 = -3 (odd) → index 2
  c3 = -1 (odd) → index 3
  S = 1 xor 2 xor 3 = 0

d = S xor M = 0 xor 2 = 2

Modify index (2 - 1) = 1 → coefficient -3 → -2

NO SHRINKAGE. Succeeds.

Vector 3 — Actual shrinkage
Group values: [1, -1, 2]
Message bits = 01 (M = 1)

Compute S:
  c1 = 1 → index 1
  c2 = -1 → index 2
  c3 = 2 → even (no contribution)
  S = 1 xor 2 = 3

d = 3 xor 1 = 2

Modify coefficient at index 1 (0-based): c2 = -1

Applying F5 decrement:
  -1 + 1 = 0   <-- shrinkage

Result: group discarded; message chunk is retried.

8. Test Cases (Implementation Verification)

Each test validates a specific behavior.

Test 1 — Syndrome correctness
Input: group = [3, 6, -5, 4]
Odd positions: c1=3, c3=-5
Indices contributing: 1, 3
Expected S = 1 xor 3 = 2

Test 2 — No-modification case
group = [3, 2, 5]
Computed S = 1 xor 3 = 2
Message M = 2
d = 0
Expected: no coefficient changed

Test 3 — Modification without shrinkage
group = [3, -4, -3]
Compute S:
  3 -> odd -> 1
  -4 -> even
  -3 -> odd -> 3
S = 1 xor 3 = 2

Message M = 1
d = 2 xor 1 = 3
Modify c3: -3 + 1 = -2

Test 4 — Shrinkage triggering retry
group = [1, -1, 5]
Compute S = 1 xor 2 xor 3 = 0
Message M = 3
d = 3
Modify c3: 5 -> 4 (no shrinkage)

Repeat test with:
group = [1, -1, 1]
Modification target becomes 0, trigger retry.

Test 5 — Permutation stability
Permutation must depend only on:
  - N (number of AC coefficients)
  - password

Permutation must NOT depend on:
  - number of non-zeros
  - coefficient values
  - shrinkage

Test by modifying coefficients and checking P is unchanged.