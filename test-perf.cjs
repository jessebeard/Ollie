const { performance } = require('perf_hooks');

function computeCategoryOld(val) {
    if (val === 0) return 0;
    val = Math.abs(val);
    let cat = 0;
    while (val > 0) {
        val >>= 1;
        cat++;
    }
    return cat;
}

function computeCategoryNew(val) {
    if (val === 0) return 0;
    return 32 - Math.clz32(Math.abs(val));
}

let sum1 = 0;
let sum2 = 0;

const start1 = performance.now();
for (let i = 0; i < 10000000; i++) {
    sum1 += computeCategoryOld(i % 2000 - 1000);
}
const end1 = performance.now();

const start2 = performance.now();
for (let i = 0; i < 10000000; i++) {
    sum2 += computeCategoryNew(i % 2000 - 1000);
}
const end2 = performance.now();

console.log("Old:", end1 - start1, "ms", sum1);
console.log("New:", end2 - start2, "ms", sum2);
