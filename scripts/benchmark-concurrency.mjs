#!/usr/bin/env node
/**
 * Concurrency & Multithreading Benchmark Suite for Ollie.
 *
 * Measures wall-clock performance, speedup factor, throughput, and memory
 * overhead across configurable worker thread counts (W = 1, 2, 4, max)
 * using real photo carrier fixtures.
 */

import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CapacityScanner } from '../src/codec/capacity-scanner.js';
import { getHardwareConcurrency } from '../src/utils/concurrency/worker-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../test/fixtures/sample vault');

function loadRealCarrierFixtures() {
    const files = fs.readdirSync(FIXTURES_DIR)
        .filter(f => f.endsWith('.jpg') && !f.includes('BIG_LONELY_DOUG')) // skip 13MB file for bench speed
        .map(f => {
            const buf = fs.readFileSync(path.join(FIXTURES_DIR, f));
            return {
                name: f,
                size: buf.length,
                arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
            };
        });
    return files;
}

async function runBenchmark() {
    console.log('\n========================================================================');
    console.log('             OLLIE MULTITHREADING PERFORMANCE BENCHMARK                 ');
    console.log('========================================================================');

    const totalCores = await getHardwareConcurrency();
    console.log(`Hardware Cores:   ${totalCores}`);
    console.log(`Node Version:     ${process.version}`);
    console.log(`Platform:         ${process.platform} (${process.arch})\n`);

    const carriers = loadRealCarrierFixtures();
    console.log(`Loaded ${carriers.length} real JPEG carrier photo fixtures from test suite:`);
    carriers.forEach(c => console.log(` - ${c.name} (${(c.size / 1024).toFixed(0)} KB)`));
    console.log('');

    // Pre-warm background worker pool
    process.stdout.write('Warming up background workers... ');
    await CapacityScanner.scan(carriers.slice(0, 2), { concurrency: 2, multithreaded: true });
    console.log('Done.\n');

    const workerConfigs = [1, 2, 4];
    if (totalCores > 4) {
        workerConfigs.push(Math.min(8, totalCores - 1));
    }
    const uniqueConfigs = [...new Set(workerConfigs)].sort((a, b) => a - b);

    console.log('--- Multi-Carrier Capacity Scan (Huffman Decode + Non-Zero AC Scan) ---');
    const results = [];
    let baselineDuration = null;

    for (const workers of uniqueConfigs) {
        process.stdout.write(`Benchmarking W = ${workers} worker(s)... `);

        // Pre-warm / GC stabilization
        if (global.gc) global.gc();

        const startMem = process.memoryUsage().heapUsed;
        const startTime = performance.now();

        const [scanResult, err] = await CapacityScanner.scan(carriers, {
            concurrency: workers,
            multithreaded: workers > 1
        });

        const endTime = performance.now();
        const endMem = process.memoryUsage().heapUsed;

        if (err) {
            console.error(`\nFAILED at W=${workers}:`, err.message);
            continue;
        }

        const durationMs = endTime - startTime;
        if (baselineDuration === null) {
            baselineDuration = durationMs;
        }

        const speedup = baselineDuration / durationMs;
        const throughput = (carriers.length / (durationMs / 1000)).toFixed(1);
        const heapDeltaMb = ((Math.max(0, endMem - startMem)) / (1024 * 1024)).toFixed(2);

        results.push({
            workers,
            durationMs: durationMs.toFixed(1),
            speedup: `${speedup.toFixed(2)}x`,
            throughput: `${throughput} photos/s`,
            totalCapacity: `${(scanResult.totalCapacity / 1024).toFixed(1)} KB`,
            heapDeltaMb: `${heapDeltaMb} MB`
        });

        console.log(`Done in ${durationMs.toFixed(1)}ms (${speedup.toFixed(2)}x speedup)`);
    }

    console.log('\n--------------------------------------------------------------------------------------------------');
    console.log('| Workers | Duration (ms) | Speedup vs Baseline | Throughput      | Total Capacity | Heap Delta |');
    console.log('--------------------------------------------------------------------------------------------------');
    for (const r of results) {
        const wStr = String(r.workers).padEnd(7);
        const dStr = String(r.durationMs).padEnd(13);
        const sStr = String(r.speedup).padEnd(19);
        const tStr = String(r.throughput).padEnd(15);
        const cStr = String(r.totalCapacity).padEnd(14);
        const mStr = String(r.heapDeltaMb).padEnd(10);
        console.log(`| ${wStr} | ${dStr} | ${sStr} | ${tStr} | ${cStr} | ${mStr} |`);
    }
    console.log('--------------------------------------------------------------------------------------------------\n');
}

runBenchmark().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Benchmark crashed:', err);
    process.exit(1);
});
