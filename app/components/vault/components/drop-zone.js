
export class DropZone {
    constructor(element, onFilesDropped) {
        this.element = element;
        this.onFilesDropped = onFilesDropped;
        this.isDragging = false;

        this.initialize();
    }

    initialize() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.element.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        this.element.addEventListener('dragenter', () => this.highlight());
        this.element.addEventListener('dragover', () => this.highlight());
        this.element.addEventListener('dragleave', () => this.unhighlight());
        this.element.addEventListener('drop', (e) => this.handleDrop(e));
    }

    highlight() {
        if (!this.isDragging) {
            this.element.classList.add('drag-active');
            this.isDragging = true;
        }
    }

    unhighlight() {
        this.element.classList.remove('drag-active');
        this.isDragging = false;
    }


    async handleDrop(e) {
        this.unhighlight();

        const items = e.dataTransfer.items;
        if (!items) return;

        const files = []; // Mixed: Files or Handles
        const queue = [];

        for (let i = 0; i < items.length; i++) {
            // Modern API: File System Access Handles
            if (items[i].kind === 'file' && typeof items[i].getAsFileSystemHandle === 'function') {
                const handle = await items[i].getAsFileSystemHandle();
                if (handle) queue.push(handle);
            }
            // Fallback: Webkit GetAsEntry
            else if (typeof items[i].webkitGetAsEntry === 'function') {
                const entry = items[i].webkitGetAsEntry();
                if (entry) queue.push(entry);
            }
        }

        await this.processQueue(queue, files);

        if (files.length > 0) {
            this.onFilesDropped(files);
        }
    }

    async processQueue(queue, files) {
        // ⚡ Bolt Optimization:
        // By replacing the sequential `while (queue.length > 0)` loop with a `map`
        // to an array of Promises and `Promise.all`, we parallelize the recursive
        // directory traversal and file fetching. This significantly improves throughput
        // when dropping folders with many items.
        const promises = queue.map(async (item) => {
            // Handle Logic (Modern)
            if (item.kind === 'file' && item.getFile) {
                // It's a FileSystemFileHandle
                if (this.isJpeg(item.name)) {
                    // Attach the File object to the Handle for convenience, or return Handle
                    // We return the HANDLE. The consumer must call getFile().
                    // But to be backward compatible/easy, let's attach the file?
                    // No, cleaner to return Handle. VaultUI must adapt.
                    files.push(item);
                }
            } else if (item.kind === 'directory' && item.values) {
                // It's a FileSystemDirectoryHandle (Modern)
                const subQueue = [];
                for await (const entry of item.values()) {
                    subQueue.push(entry);
                }
                await this.processQueue(subQueue, files);
            }
            // Entry Logic (Legacy)
            else if (item.isFile) {
                if (this.isJpeg(item.name)) {
                    const file = await this.getFileFromEntry(item);
                    files.push(file);
                }
            } else if (item.isDirectory) {
                const reader = item.createReader();
                const entries = await this.readEntriesPromise(reader);
                await this.processQueue(entries, files);
            }
        });

        await Promise.all(promises);
    }

    readEntriesPromise(reader) {
        return new Promise((resolve, reject) => {
            reader.readEntries(entries => resolve(entries), err => reject(err));
        });
    }

    getFileFromEntry(entry) {
        return new Promise((resolve, reject) => {
            entry.file(file => resolve(file), err => reject(err));
        });
    }

    isJpeg(filename) {
        return /\.(jpg|jpeg)$/i.test(filename);
    }
}
