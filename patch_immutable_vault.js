import fs from 'fs';

let content = fs.readFileSync('src/structures/vault/immutable-vault.js', 'utf8');

content = "import { cryptoInstance } from '../../information-theory/cryptography/crypto-compat.js';\n" + content;

content = content.replace("return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;", "return cryptoInstance.randomUUID();");

fs.writeFileSync('src/structures/vault/immutable-vault.js', content);
