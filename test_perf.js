const { performance } = require('perf_hooks');

function computeCategoryOriginal(val) {
    if (val === 0) return 0;
    val = Math.abs(val);
    let cat = 0;
    while (val > 0) {
        val >>= 1;
        cat++;
    }
    return cat;
}

function computeCategoryClz32(val) {
    return val === 0 ? 0 : 32 - Math.clz32(Math.abs(val));
}

function computeCategoryClz32NoAbs(val) {
    return val === 0 ? 0 : 32 - Math.clz32(val < 0 ? -val : val);
}

const testData = new Int32Array(1000000);
for(let i = 0; i < testData.length; i++) {
    testData[i] = Math.floor(Math.random() * 4000) - 2000;
}

function runTest(name, fn) {
    let sum = 0;
    const start = performance.now();
    for (let i = 0; i < testData.length; i++) {
        sum += fn(testData[i]);
    }
    const end = performance.now();
    console.log(`${name}: ${end - start} ms (sum: ${sum})`);
}

// Warmup
runTest('Original', computeCategoryOriginal);
runTest('Clz32', computeCategoryClz32);
runTest('Clz32NoAbs', computeCategoryClz32NoAbs);

console.log('--- Real run ---');
runTest('Original', computeCategoryOriginal);
runTest('Clz32', computeCategoryClz32);
runTest('Clz32NoAbs', computeCategoryClz32NoAbs);
