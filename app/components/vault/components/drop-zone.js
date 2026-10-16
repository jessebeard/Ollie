
const MAX_TRAVERSAL_DEPTH = 16;
const MAX_COLLECTED_FILES = 4096;

export class DropZone {
    constructor(element, onFilesDropped) {
        this.element = element;
        this.onFilesDropped = onFilesDropped;
        this.isDragging = false;

        this.initialize();
    }

    initialize() {
        if (!this.element) return;
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

        const items = e.dataTransfer && e.dataTransfer.items;
        if (!items || items.length === 0) return;

        const pending = [];
        const errors = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind !== 'file') continue;
            try {
                if (typeof item.getAsFileSystemHandle === 'function') {
                    pending.push(item.getAsFileSystemHandle());
                } else if (typeof item.webkitGetAsEntry === 'function') {
                    const entry = item.webkitGetAsEntry();
                    if (entry) pending.push(Promise.resolve(entry));
                } else if (item.getAsFile) {
                    const file = item.getAsFile();
                    if (file) pending.push(Promise.resolve(file));
                }
            } catch (err) {
                errors.push(err);
            }
        }

        const roots = [];
        for (const p of pending) {
            try {
                const root = await p;
                if (root) roots.push(root);
            } catch (err) {
                errors.push(err);
            }
        }

        const files = [];
        await this.processQueue(roots, files, errors, 0);

        files.sort((a, b) => String(a.name).localeCompare(String(b.name)));

        this.onFilesDropped(files, errors);
    }

    async processQueue(queue, files, errors, depth) {
        if (depth > MAX_TRAVERSAL_DEPTH) return;

        const batch = queue.splice(0, queue.length);
        const promises = batch.map(async (item) => {
            if (files.length >= MAX_COLLECTED_FILES) return;

            if (item.kind === 'file' && typeof item.getFile === 'function') {
                if (this.isJpeg(item.name)) {
                    files.push(item);
                }
            } else if (item.kind === 'directory' && typeof item.values === 'function') {
                const subQueue = [];
                try {
                    for await (const entry of item.values()) {
                        subQueue.push(entry);
                    }
                } catch (err) {
                    errors.push(err);
                }
                await this.processQueue(subQueue, files, errors, depth + 1);
            } else if (item.isFile) {
                if (this.isJpeg(item.name)) {
                    try {
                        const file = await this.getFileFromEntry(item);
                        files.push(file);
                    } catch (err) {
                        errors.push(err);
                    }
                }
            } else if (item.isDirectory) {
                try {
                    const reader = item.createReader();
                    const entries = await this.readEntriesPromise(reader);
                    await this.processQueue([...entries], files, errors, depth + 1);
                } catch (err) {
                    errors.push(err);
                }
            }
        });

        await Promise.all(promises);
    }

    async readEntriesPromise(reader) {
        return new Promise((resolve, reject) => {
            const allEntries = [];
            const readBatch = () => {
                reader.readEntries(entries => {
                    if (entries.length === 0) {
                        resolve(allEntries);
                        return;
                    }
                    allEntries.push(...entries);
                    readBatch();
                }, err => reject(err));
            };
            readBatch();
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
