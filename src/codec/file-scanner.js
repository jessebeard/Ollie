/**
 * FileScanner - Handles directory scanning using File System Access API
 */
export class FileScanner {
    /**
     * Request user to select a directory and return file handles
     * @param {string} pattern - Glob pattern or extension to filter (e.g. '*.jpg')
     * @returns {Promise<Array<FileSystemFileHandle>>}
     */
    static async scanDirectory(pattern = '*.*') {
        if (typeof window === 'undefined' || !window.showDirectoryPicker) {
            throw new Error('File System Access API not supported in this environment');
        }

        try {
            const dirHandle = await window.showDirectoryPicker();
            const files = [];

            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file') {
                    if (this.matchesPattern(entry.name, pattern)) {
                        files.push(entry);
                    }
                }
            }

            files.sort((a, b) => a.name.localeCompare(b.name));

            return files;
        } catch (error) {
            if (error.name === 'AbortError') {
                return []; 
            }
            throw error;
        }
    }

    /**
     * Simple pattern matching for filenames
     * @param {string} filename 
     * @param {string} pattern 
     * @returns {boolean}
     */
    static matchesPattern(filename, pattern) {
        if (!pattern || pattern === '*.*' || pattern === '*') return true;

        if (pattern.startsWith('*.')) {
            const ext = pattern.slice(1); 
            return filename.toLowerCase().endsWith(ext.toLowerCase());
        }

        return filename === pattern;
    }
}
