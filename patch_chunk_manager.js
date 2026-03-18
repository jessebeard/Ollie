import fs from 'fs';

let content = fs.readFileSync('src/information-theory/steganography/chunk-manager.js', 'utf8');

content = "import { cryptoInstance } from '../cryptography/crypto-compat.js';\n" + content;

content = content.replace(/static generateId\(\) {[\s\S]*?return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace\(\/\[xy\]\/g, \(c\) => {[\s\S]*?const r = Math.random\(\) \* 16 \| 0;[\s\S]*?const v = c === 'x' \? r : \(r & 0x3 \| 0x8\);[\s\S]*?return v.toString\(16\);[\s\S]*?}\);[\s\S]*?}/, "static generateId() {\n        return cryptoInstance.randomUUID();\n    }");

fs.writeFileSync('src/information-theory/steganography/chunk-manager.js', content);
