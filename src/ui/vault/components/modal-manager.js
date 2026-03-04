
export class ModalManager {
    constructor() {
        this.overlay = this.createOverlay();
        document.body.appendChild(this.overlay);
    }

    createOverlay() {
        const el = document.createElement('div');
        el.className = 'modal-overlay';
        el.style.display = 'none';
        return el;
    }

    show(modal) {
        // Clear previous
        this.hide();

        this.overlay.appendChild(modal);
        this.overlay.style.display = 'flex';

        // Focus first input or button
        const focusable = modal.querySelector('input, button');
        if (focusable) focusable.focus();
    }

    hide() {
        this.overlay.style.display = 'none';
        this.overlay.innerHTML = ''; // Force remove all children
    }

    async prompt(title, label, type = 'text') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-dialog';
            modal.innerHTML = `
                <h3>${title}</h3>
                <div class="form-group">
                    <label>${label}</label>
                    <input type="${type}" class="prompt-input">
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary cancel-btn">Cancel</button>
                    <button class="btn btn-primary confirm-btn">OK</button>
                </div>
            `;

            this.show(modal);

            const cleanup = () => {
                this.hide();
            };

            const confirm = () => {
                const input = modal.querySelector('.prompt-input');
                const val = input ? input.value : '';
                cleanup();
                // Small delay to ensure UI updates before next prompt
                setTimeout(() => resolve(val), 50);
            };

            const cancel = () => {
                cleanup();
                setTimeout(() => resolve(null), 50);
            };

            modal.querySelector('.confirm-btn').onclick = confirm;
            modal.querySelector('.cancel-btn').onclick = cancel;

            const input = modal.querySelector('.prompt-input');
            if (input) {
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') confirm();
                    if (e.key === 'Escape') cancel();
                };
            }
        });
    }

    async confirm(message) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-dialog';
            modal.innerHTML = `
                <h3>Confirmation</h3>
                <p>${message}</p>
                <div class="modal-actions">
                    <button class="btn btn-secondary cancel-btn">No</button>
                    <button class="btn btn-primary confirm-btn">Yes</button>
                </div>
            `;

            this.show(modal);

            const cleanup = () => {
                this.hide();
            };

            modal.querySelector('.confirm-btn').onclick = () => {
                cleanup();
                setTimeout(() => resolve(true), 50);
            };
            modal.querySelector('.cancel-btn').onclick = () => {
                cleanup();
                setTimeout(() => resolve(false), 50);
            };
        });
    }

    async showForm(title, fields, initialValues = {}) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-dialog modal-lg'; // Larger modal

            const inputsHtml = fields.map(field => {
                const val = initialValues[field.name] || '';
                const type = field.type || 'text';
                const label = field.label || field.name;
                const required = field.required ? 'required' : '';

                if (type === 'textarea') {
                    return `
                        <div class="form-group">
                            <label>${label}</label>
                            <textarea name="${field.name}" class="form-control" ${required}>${val}</textarea>
                        </div>`;
                }

                return `
                    <div class="form-group">
                        <label>${label}</label>
                        <input type="${type}" name="${field.name}" value="${val}" class="form-control" ${required}>
                    </div>`;
            }).join('');

            modal.innerHTML = `
                <h3>${title}</h3>
                <form id="dynamicForm">
                    ${inputsHtml}
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </div>
                </form>
            `;

            this.show(modal);

            const cleanup = () => {
                this.hide();
            };

            const form = modal.querySelector('form');
            form.onsubmit = (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                const data = {};
                for (let [key, val] of formData.entries()) {
                    data[key] = val;
                }

                // Handle Tags special case (comma separated string -> array)
                if (data.tags) {
                    data.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
                }

                cleanup();
                setTimeout(() => resolve(data), 50);
            };

            modal.querySelector('.cancel-btn').onclick = () => {
                cleanup();
                setTimeout(() => resolve(null), 50);
            };
        });
    }

    showAlert(title, message, type = 'info') {
        let iconSrc = 'src/ui/assets/ollie-happy.svg';
        if (type === 'error') {
            iconSrc = 'src/ui/assets/ollie-sad.svg';
        }

        const modal = document.createElement('div');
        modal.className = `modal-dialog alert-${type}`;
        modal.innerHTML = `
            <div style="text-align: center; margin-bottom: 1rem;">
                <img src="${iconSrc}" width="80" height="80" alt="Ollie ${type}">
            </div>
            <h3 style="text-align: center;">${title}</h3>
            <p style="text-align: center; color: var(--text-muted);">${message}</p>
            <div class="modal-actions" style="justify-content: center; margin-top: 1.5rem;">
                <button class="btn btn-primary confirm-btn">OK</button>
            </div>
        `;

        this.show(modal);

        modal.querySelector('.confirm-btn').onclick = () => {
            this.hide();
        };
    }
}
