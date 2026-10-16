import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { calculateJUniwardCosts } from '../../src/information-theory/steganography/juniward.js';

/**
 * J-UNIWARD Metamorphic Relations Fuzz Suite.
 *
 * @param {number} scale - Iteration multiplier (1 = CI smoke)
 */
export async function runJuniwardMrFuzz(scale = 1) {
    const iters = Math.max(10, Math.floor(25 * scale));

    // MR-juniward-1: Smooth vs Textured sensitivity bounding
    // Smooth/flat blocks have higher average sensitivity and modification costs than busy textured blocks
    await assertProperty(
        [Arbitrary.integer(1, 10), Arbitrary.integer(100, 800)],
        (textureScale, dcLevel) => {
            // Flat block (all zeros in AC)
            const flatBlock = new Int32Array(64);
            flatBlock[0] = dcLevel;

            // Textured block (multiple high-frequency ACs scaled by generator)
            const textBlock = new Int32Array(64);
            textBlock[0] = dcLevel;
            for (let i = 1; i < 30; i++) textBlock[i] = ((i % 7) + 1) * 10 * textureScale;

            const flatCosts = calculateJUniwardCosts([flatBlock], undefined, { lambda: 0 });
            const textCosts = calculateJUniwardCosts([textBlock], undefined, { lambda: 0 });

            // Normalize out the 10x zero-coefficient penalty so we compare pure wavelet sensitivity:
            // For coefficients where flatBlock[c] is 0 and textBlock[c] is non-zero,
            // flatBlock gets 10x penalty while textBlock gets 1x. Dividing by the penalty factor
            // isolates the spatial wavelet sensitivity, which must be strictly higher for flat regions.
            for (let c = 1; c < 30; c++) {
                const flatPenalty = flatBlock[c] === 0 ? 10.0 : 1.0;
                const textPenalty = textBlock[c] === 0 ? 10.0 : 1.0;
                const flatNorm = flatCosts.rhoPlus[c - 1] / flatPenalty;
                const textNorm = textCosts.rhoPlus[c - 1] / textPenalty;

                if (flatNorm <= textNorm) {
                    throw new Error(`Smooth block base sensitivity (${flatNorm}) <= textured block base sensitivity (${textNorm}) at AC ${c}`);
                }
            }
        },
        iters
    );

    // MR-juniward-2: Quantization step monotonicity
    // Scaling quantization table up strictly increases distortion cost
    await assertProperty(
        [Arbitrary.dctBlock()],
        (block) => {
            const qSmall = new Float32Array(64).fill(10);
            const qLarge = new Float32Array(64).fill(50);

            const costSmall = calculateJUniwardCosts([block], qSmall, { lambda: 0 });
            const costLarge = calculateJUniwardCosts([block], qLarge, { lambda: 0 });

            // For every AC coefficient, larger Q must yield greater or equal cost
            for (let i = 0; i < 63; i++) {
                if (costLarge.rhoPlus[i] < costSmall.rhoPlus[i]) {
                    throw new Error(`Quantization monotonicity violated at ${i}: ${costLarge.rhoPlus[i]} < ${costSmall.rhoPlus[i]}`);
                }
            }
        },
        iters
    );

    // MR-juniward-3: Cost positivity & symmetry
    // rhoPlus === rhoMinus >= 0.01 for all coefficients
    await assertProperty(
        [Arbitrary.dctBlock()],
        (block) => {
            const costs = calculateJUniwardCosts([block], undefined, { lambda: 0.3, costSeed: 'test-seed' });
            for (let i = 0; i < 63; i++) {
                if (costs.rhoPlus[i] < 0.01 || costs.rhoMinus[i] < 0.01) {
                    throw new Error(`Cost positivity violated at ${i}`);
                }
                if (costs.rhoPlus[i] !== costs.rhoMinus[i]) {
                    throw new Error(`Cost symmetry violated at ${i}`);
                }
            }
        },
        iters
    );

    // MR-juniward-4: Anti-SCA perturbation bounds and activation
    // Cost with seed is within [baseCost, baseCost * (1 + lambda)] and strictly activates
    await assertProperty(
        [Arbitrary.dctBlock(), Arbitrary.string(1, 16)],
        (block, seed) => {
            const lambda = 0.3;
            const unperturbed = calculateJUniwardCosts([block], undefined, { costSeed: seed, lambda: 0 });
            const perturbed = calculateJUniwardCosts([block], undefined, { costSeed: seed, lambda });

            let hasPerturbation = false;
            for (let i = 0; i < 63; i++) {
                const base = unperturbed.rhoPlus[i];
                const pert = perturbed.rhoPlus[i];
                const maxAllowed = base * (1.0 + lambda) + 1e-6;
                const minAllowed = base - 1e-6;

                if (pert < minAllowed || pert > maxAllowed) {
                    throw new Error(`Perturbation out of bounds at ${i}: base=${base}, pert=${pert}, lambda=${lambda}`);
                }

                // If base is above the 0.01 clamp floor, verify that perturbation strictly increased cost
                if (base > 0.02 && pert > base + 1e-6) {
                    hasPerturbation = true;
                }
            }

            // At least one non-clamped AC coefficient must experience genuine perturbation
            const hasNonClamped = Array.from(unperturbed.rhoPlus).some(c => c > 0.02);
            if (hasNonClamped && !hasPerturbation) {
                throw new Error(`Anti-SCA perturbation was completely inactive across all 63 AC coefficients`);
            }
        },
        iters
    );
}
