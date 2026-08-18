// ============================================
// ETHER RESONANCE — DRAWING PAD
// Fullscreen ink canvas → grayscale mask → particle
// displacement (reuses the image offset path).
// ============================================

export const DRAW_W = 320;

export class DrawingPad {
    constructor(onApply) {
        this.onApply = onApply; // () => void
        this.enabled = false;
        this.tool = 'pen'; // 'pen' | 'eraser'
        this.brushSize = 24;
        this.symmetry = false;
        this.pulsar = false;
        this.liveApply = true;

        this.canvas = document.createElement('canvas');
        this.canvas.id = 'draw-canvas';
        this.canvas.className = 'draw-canvas hidden';
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        document.body.appendChild(this.canvas);

        this._drawing = false;
        this._lastX = 0;
        this._lastY = 0;
        this._undoStack = [];
        this._redoStack = [];
        this._snapshotDepth = 0;

        this._bindEvents();
    }

    setEnabled(on) {
        this.enabled = on;
        this.canvas.classList.toggle('hidden', !on);
        this.canvas.style.pointerEvents = on ? 'all' : 'none';
        if (on) this._resize();
    }

    setTool(tool) { this.tool = tool === 'eraser' ? 'eraser' : 'pen'; }
    setBrushSize(v) { this.brushSize = Math.max(2, Number(v) || 24); }
    setSymmetry(on) { this.symmetry = !!on; }
    setPulsar(on) {
        this.pulsar = !!on;
        if (this.onApply) this.onApply();
    }
    setLiveApply(on) { this.liveApply = !!on; }

    // --- ink rendering -------------------------------------------------
    _resize() {
        const pr = Math.min(2, window.devicePixelRatio || 1);
        this.canvas.width = Math.floor(window.innerWidth * pr);
        this.canvas.height = Math.floor(window.innerHeight * pr);
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        this.ctx.setTransform(pr, 0, 0, pr, 0, 0);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    _bindEvents() {
        const pos = e => {
            const t = e.touches && e.touches[0] ? e.touches[0] : e;
            return [t.clientX, t.clientY];
        };
        const down = e => {
            if (!this.enabled || this.tool === 'select') return;
            e.preventDefault();
            this._snapshot();
            const [x, y] = pos(e);
            this._drawing = true;
            this._lastX = x;
            this._lastY = y;
            this._stroke(x, y);
        };
        const move = e => {
            if (!this._drawing) return;
            e.preventDefault();
            const [x, y] = pos(e);
            this._stroke(x, y);
        };
        const up = () => {
            if (!this._drawing) return;
            this._drawing = false;
            this._commit();
        };

        this.canvas.addEventListener('pointerdown', down);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        window.addEventListener('resize', () => { if (this.enabled) this._resize(); });
    }

    _stroke(x, y) {
        const ctx = this.ctx;
        const color = this.tool === 'eraser' ? 'rgba(0,0,0,1)' : 'rgba(255,255,255,1)';
        ctx.strokeStyle = color;
        ctx.lineWidth = this.brushSize;
        ctx.beginPath();
        ctx.moveTo(this._lastX, this._lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        if (this.symmetry) {
            const cx = window.innerWidth / 2;
            const sx = 2 * cx - x;
            ctx.beginPath();
            ctx.moveTo(2 * cx - this._lastX, this._lastY);
            ctx.lineTo(sx, y);
            ctx.stroke();
        }
        this._lastX = x;
        this._lastY = y;
    }

    _snapshot() {
        if (this._snapshotDepth > 0) return;
        this._snapshotDepth = 1;
        const img = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this._undoStack.push(img);
        if (this._undoStack.length > 25) this._undoStack.shift();
        this._redoStack = [];
    }

    _commit() {
        this._snapshotDepth = 0;
        if (this.liveApply && this.onApply) this.onApply();
    }

    undo() {
        if (!this._undoStack.length) return;
        const img = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this._redoStack.push(img);
        const prev = this._undoStack.pop();
        this.ctx.putImageData(prev, 0, 0);
        if (this.liveApply && this.onApply) this.onApply();
    }

    redo() {
        if (!this._redoStack.length) return;
        const img = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this._undoStack.push(img);
        const next = this._redoStack.pop();
        this.ctx.putImageData(next, 0, 0);
        if (this.liveApply && this.onApply) this.onApply();
    }

    clear() {
        this._snapshot();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this._commit();
    }

    isEmpty() {
        const d = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
        for (let i = 3; i < d.length; i += 4) {
            if (d[i] > 8) return false;
        }
        return true;
    }

    // --- mask → offset source ----------------------------------------
    toOffsetSource(count) {
        const w = DRAW_W;
        const h = Math.max(1, Math.ceil(count / w));
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const octx = off.getContext('2d', { willReadFrequently: true });
        octx.fillStyle = '#000';
        octx.fillRect(0, 0, w, h);
        octx.drawImage(this.canvas, 0, 0, w, h);
        const data = octx.getImageData(0, 0, w, h).data;
        return { type: 'drawing', data: data, w: w, h: h };
    }
}