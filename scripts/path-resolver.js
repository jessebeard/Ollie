import path from 'path';

/**
 * Resolves and sanitizes a path to ensure it remains within the root directory.
 * @param {string} root - The base root directory.
 * @param {string} reqPath - The requested relative path.
 * @returns {string|null} The resolved absolute path, or null if it escapes the root.
 */
export function resolveSafePath(root, reqPath) {
    let filePath = path.normalize(path.join(root, reqPath));
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
        return null;
    }
    return filePath;
}
