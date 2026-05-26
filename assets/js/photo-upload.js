/* ============================================================
   photo-upload.js — Reusable photo upload widget
   Shared by lapor.html (public reports) and index.html (households)
   ============================================================ */
'use strict';

const PhotoUpload = {
    MAX_FILES: 5,
    MAX_MB:    5,

    /**
     * Validate a FileList against rules.
     * Returns { valid: true } or { valid: false, message: '...' }
     */
    validate(fileList, existingCount = 0) {
        const allowed = ['image/jpeg', 'image/png'];
        const allowedExt = ['jpg', 'jpeg', 'png'];
        const files = Array.from(fileList);

        if (files.length === 0) return { valid: true };

        if (existingCount + files.length > this.MAX_FILES) {
            return { valid: false, message: `Maksimal ${this.MAX_FILES} foto. Sudah ada ${existingCount}, pilih paling banyak ${this.MAX_FILES - existingCount} foto lagi.` };
        }

        for (const f of files) {
            const ext = f.name.split('.').pop().toLowerCase();
            if (!allowedExt.includes(ext)) {
                return { valid: false, message: `File "${f.name}" tidak diizinkan. Gunakan JPG atau PNG.` };
            }
            if (!allowed.includes(f.type)) {
                return { valid: false, message: `File "${f.name}" bukan gambar yang valid.` };
            }
            if (f.size > this.MAX_MB * 1024 * 1024) {
                return { valid: false, message: `File "${f.name}" melebihi batas ${this.MAX_MB} MB.` };
            }
        }
        return { valid: true };
    },

    /**
     * Build a preview strip of <img> thumbnails for a FileList.
     * Returns a DocumentFragment.
     */
    buildPreviewStrip(fileList) {
        const frag = document.createDocumentFragment();
        Array.from(fileList).forEach(file => {
            const url = URL.createObjectURL(file);
            const img = document.createElement('img');
            img.src = url;
            img.className = 'photo-thumb';
            img.alt = file.name;
            img.title = file.name;
            img.onload = () => URL.revokeObjectURL(url);
            frag.appendChild(img);
        });
        return frag;
    },

    /**
     * Build a preview strip from saved filenames (already uploaded).
     * baseUrl e.g. 'uploads/reports/' or 'uploads/houses/'
     */
    buildSavedStrip(filenames, baseUrl, removable = false, onRemove = null) {
        const frag = document.createDocumentFragment();
        if (!Array.isArray(filenames)) return frag;
        filenames.forEach(name => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:relative;display:inline-block;';
            const img = document.createElement('img');
            img.src = baseUrl + name;
            img.className = 'photo-thumb';
            img.alt = name;
            img.title = 'Klik untuk perbesar';
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => PhotoUpload.lightbox(img.src));
            wrap.appendChild(img);
            if (removable && onRemove) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.innerHTML = '&times;';
                btn.title = 'Hapus foto';
                btn.style.cssText = 'position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;border:none;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;line-height:1;cursor:pointer;padding:0;';
                btn.addEventListener('click', (e) => { e.stopPropagation(); onRemove(name, wrap); });
                wrap.appendChild(btn);
            }
            frag.appendChild(wrap);
        });
        return frag;
    },

    /** Simple lightbox */
    lightbox(src) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'max-width:92vw;max-height:88vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.6);';
        overlay.appendChild(img);
        overlay.addEventListener('click', () => document.body.removeChild(overlay));
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { document.body.removeChild(overlay); document.removeEventListener('keydown', esc); }
        });
        document.body.appendChild(overlay);
    },

    /**
     * Upload photos to the upload endpoint after a record has been saved.
     * @param {string} target  'report' | 'house'
     * @param {number} id      The record's database id
     * @param {FileList} fileList
     * @returns {Promise<{ok: boolean, data: object}>}
     */
    async upload(target, id, fileList) {
        if (!fileList || fileList.length === 0) return { ok: true, data: { data: { all_photos: [] } } };
        const form = new FormData();
        Array.from(fileList).forEach(f => form.append('photos[]', f));
        try {
            const res = await fetch(`api/public/upload.php?target=${target}&id=${id}`, {
                method: 'POST',
                body: form,
                // ⚠️ Do NOT set Content-Type header — browser sets it with boundary automatically
            });
            const data = await res.json();
            return { ok: res.ok, data };
        } catch (err) {
            console.error('[PhotoUpload] Upload error:', err);
            return { ok: false, data: { success: false, message: 'Upload gagal: ' + err.message } };
        }
    },
};