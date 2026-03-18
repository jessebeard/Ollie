import { ChunkManager } from './src/information-theory/steganography/chunk-manager.js';
import { PasswordVault } from './src/structures/vault/immutable-vault.js';

console.log("Chunk UUID:", ChunkManager.generateId());
console.log("Vault ID:", PasswordVault.generateId());
