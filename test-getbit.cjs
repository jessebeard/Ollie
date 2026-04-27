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

function getBitRepresentationOld(val) {
    if (val > 0) return val;
    const cat = computeCategoryOld(val);
    return val + (1 << cat) - 1;
}

function computeCategoryNew(val) {
    if (val === 0) return 0;
    return 32 - Math.clz32(Math.abs(val));
}

function getBitRepresentationNew(val) {
    if (val > 0) return val;
    const cat = 32 - Math.clz32(-val);
    return val + (1 << cat) - 1;
}

const vals = [];
for (let i = 0; i < 10000000; i++) {
    vals.push(Math.floor(Math.random() * 2000) - 1000);
}

let start = performance.now();
for (let i = 0; i < vals.length; i++) {
    getBitRepresentationOld(vals[i]);
}
console.log('Old:', performance.now() - start);

start = performance.now();
for (let i = 0; i < vals.length; i++) {
    getBitRepresentationNew(vals[i]);
}
console.log('New:', performance.now() - start);
