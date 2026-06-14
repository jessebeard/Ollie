const fs = require('fs');
const content = fs.readFileSync('test-output.txt', 'utf8');
const lines = content.split('\n');
for (let line of lines) {
    if (line.includes('ModalManager')) {
        console.log(line);
    }
}
