import { describe, it, expect } from '../../utils/test-runner.js';
import { PasswordVault } from '../../../src/structures/vault/immutable-vault.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Regression: the stripe planner previously concentrated every coded stripe
 * onto the single largest carrier (counts=[k,0,...,0]). One file stores one
 * F5 container, so write-back overwrote that file k times; reload found 1
 * unique share of threshold k and failed with "Insufficient shares". The
 * planner now spreads one stripe per carrier.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class MockFile {
    constructor(buffer, name) {
        this.buffer = buffer;
        this.name = name;
    }
    async arrayBuffer() {
        return this.buffer.buffer.slice(this.buffer.byteOffset, this.buffer.byteOffset + this.buffer.byteLength);
    }
}

const FIXTURE_NAMES = [
    'Hills_to_the_southwest_of_Nainital.jpg',
    'Blick_auf_den_Plansee.jpg',
    'Barrage_de_Roselend_(50498176838).jpg',
    'Escursionismo_sulle_Alpi.jpg',
    'Entrance_of_Kotor_Bay_with_rocks_and_sunset.jpg',
    'Depuis_le_Tri�ves_(53476365753).jpg'
];

describe('Threshold spread save (multi-carrier distribution)', () => {
    it('distributes shares across distinct carriers and survives losing files down to the threshold', async () => {
        const fixturesDir = path.join(__dirname, '../../fixtures/test vault');
        const available = fs.readdirSync(fixturesDir);
        const files = [];
        for (const name of FIXTURE_NAMES) {
            const match = available.find(f => f.endsWith('.jpg') && f.slice(0, 12) === name.slice(0, 12));
            if (!match) throw new Error(`fixture missing: ${name}`);
            files.push(new MockFile(fs.readFileSync(path.join(fixturesDir, match)), match));
        }

        let vault = new PasswordVault([], null, true, 'master-pw');
        [vault] = await vault.addEntry({
            title: 'Test entry',
            password: 'entry-secret',
            notes: 'long note '.repeat(300)
        });

        const [results, saveErr] = await vault.save(files, 'master-pw');
        expect(saveErr).toEqual(null);
        if (!results) throw new Error('no results');

        const distinctSources = new Set(results.map(r => r.sourceIndex));
        if (distinctSources.size !== results.length) {
            throw new Error(
                `write-back would overwrite: ${results.length} results map to ` +
                `${distinctSources.size} distinct carriers`
            );
        }

        // Simulate UI write-back via sourceIndex mapping.
        const written = new Array(files.length).fill(null);
        for (const r of results) written[r.sourceIndex] = r.data;
        const savedFiles = [];
        for (let i = 0; i < files.length; i++) {
            if (written[i]) savedFiles.push(new MockFile(new Uint8Array(written[i]), files[i].name));
        }

        const n = savedFiles.length;
        const k = Math.ceil(n / 2);
        if (n < 4) throw new Error(`expected most of the ${files.length} carriers to participate, got ${n}`);

        // Full set loads.
        const [fullVault, fullErr] = await PasswordVault.load(savedFiles, 'master-pw');
        expect(fullErr).toEqual(null);
        if (fullVault.entries.length !== 1) throw new Error('entry lost on full-set load');

        // Losing files down to exactly the threshold still recovers.
        const subset = savedFiles.slice(0, k);
        const [subVault, subErr] = await PasswordVault.load(subset, 'master-pw');
        expect(subErr).toEqual(null);
        if (subVault.entries.length !== 1) throw new Error('entry lost on threshold-subset load');

        // Below the threshold must fail loudly.
        const tooFew = savedFiles.slice(0, k - 1);
        const [, belowErr] = await PasswordVault.load(tooFew, 'master-pw');
        if (!(belowErr instanceof Error)) throw new Error('sub-threshold load should fail');
    });
});
