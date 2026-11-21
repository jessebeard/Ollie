import { describe, it, expect } from '../utils/test-runner.js';
import { runVaultModelFuzz, runZeroizationChecks, runBatchSubsetFuzz } from '../fuzz/vault-batch-fuzz.mjs';

describe('Vault model-based op-sequence fuzz (smoke)', () => {
    it('holds revision, freeze and plaintext-leak invariants across random sequences', async () => {
        await runVaultModelFuzz(1);
        expect(true).toBe(true);
    });

    it('zeroizes DEK buffers and enforces lock hygiene', async () => {
        await runZeroizationChecks(1);
        expect(true).toBe(true);
    });

    it('EC subset MRs: every k-subset recovers, k-1 fails closed', async () => {
        await runBatchSubsetFuzz(1);
        expect(true).toBe(true);
    });
});
