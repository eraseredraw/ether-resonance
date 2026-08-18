// ============================================
// ETHER RESONANCE — AUDIO ENGINE
// Mic / system / track input → FFT analysis → reactive frame.
// Pure band/beat logic lives in exported functions
// so it can be unit-tested without Web Audio.
// ============================================

export const BANDS = { bass: [2, 60], mid: [60, 250], treble: [250, 800] };

const SMOOTH = 0.35;

// Pure: average magnitude of an FFT bin range.
export function bandEnergy(bins, start, end) {
    if (bins.length === 0 || end <= start) return 0;
    const s = Math.max(0, Math.min(start, bins.length - 1));
    const e = Math.max(s + 1, Math.min(end, bins.length));
    let sum = 0;
    for (let i = s; i < e; i++) sum += bins[i];
    return sum / (e - s);
}

// Pure: energy-based beat detection against rolling history.
// Returns [isBeat, updatedHistory].
export function detectBeat(energy, history) {
    const mean = history.length
        ? history.reduce((a, b) => a + b, 0) / history.length
        : 0;
    history.push(energy);
    if (history.length > 43) history.shift();
    if (mean <= 0) return [false, history];
    const isBeat = energy > mean * 1.35 && energy > 0.05;
    return [isBeat, history];
}

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.analyser = null;
        this.sourceNode = null;
        this.gainNode = null;
        this.audioElement = null;
        this.objectUrl = null;
        this.active = false;
        this.mode = null; // 'mic' | 'system' | 'file'
        this.fileName = null;
        this.frame = { level: 0, bass: 0, mid: 0, treble: 0, beat: false };
        this._timeDomain = null;
        this._freqData = null;
        this._history = [];
        this._lastBeatTime = -1;
        this._beatCooldown = 0.28;
    }

    async startMic() {
        this.stop();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia unsupported');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        this._setupStream(stream, 'mic');
        return this.frame;
    }

    async startSystem() {
        this.stop();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            throw new Error('getDisplayMedia unsupported');
        }
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'monitor' },
            audio: true
        });
        // Keep only the audio track — the video track is just a capture requirement
        stream.getVideoTracks().forEach(t => t.stop());
        if (!stream.getAudioTracks().length) {
            stream.getTracks().forEach(t => t.stop());
            throw new Error('No system audio');
        }
        this._setupStream(stream, 'system');
        return this.frame;
    }

    async loadFile(file) {
        this.stop();
        const ctx = this._getContext();
        const url = URL.createObjectURL(file);
        const el = new Audio();
        el.src = url;
        el.loop = true;
        el.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
            el.onloadedmetadata = resolve;
            el.onerror = () => reject(new Error('bad audio file'));
        });
        this.objectUrl = url;
        this.audioElement = el;

        const mediaSrc = ctx.createMediaElementSource(el);
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 0.8;
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;
        this._freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this._timeDomain = new Uint8Array(this.analyser.fftSize);
        mediaSrc.connect(this.gainNode);
        this.gainNode.connect(this.analyser);
        this.sourceNode = mediaSrc;

        this.mode = 'file';
        this.fileName = file.name;
        this.active = true;
        this._history = [];
        await el.play().catch(() => {});
        return this.frame;
    }

    _getContext() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) throw new Error('Web Audio unsupported');
            this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    _setupStream(stream, mode) {
        const ctx = this._getContext();
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;
        this._freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this._timeDomain = new Uint8Array(this.analyser.fftSize);

        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 1;
        this.gainNode.connect(this.analyser);

        const mediaSrc = ctx.createMediaStreamSource(stream);
        mediaSrc.connect(this.gainNode);
        this.sourceNode = mediaSrc;
        this.stream = stream;
        this.mode = mode;
        this.active = true;
        this._history = [];
    }

    // --- playback controls (file mode) -------------------------------
    isPlaying() {
        return !!(this.audioElement && !this.audioElement.paused && !this.audioElement.ended);
    }

    togglePlay() {
        if (!this.audioElement) return;
        if (this.audioElement.paused) {
            this._getContext();
            this.audioElement.play().catch(() => {});
        } else {
            this.audioElement.pause();
        }
    }

    setVolume(v) {
        if (this.gainNode) this.gainNode.gain.value = Math.max(0, Math.min(1, v));
    }

    setSeek(frac) {
        if (!this.audioElement || !this.audioElement.duration) return;
        this.audioElement.currentTime = frac * this.audioElement.duration;
    }

    getProgress() {
        if (!this.audioElement || !this.audioElement.duration) return 0;
        return this.audioElement.currentTime / this.audioElement.duration;
    }

    stop() {
        this.active = false;
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = '';
            this.audioElement = null;
        }
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }
        if (this.sourceNode) {
            try { this.sourceNode.disconnect(); } catch (e) { /* noop */ }
            this.sourceNode = null;
        }
        if (this.gainNode) {
            try { this.gainNode.disconnect(); } catch (e) { /* noop */ }
            this.gainNode = null;
        }
        if (this.analyser) {
            try { this.analyser.disconnect(); } catch (e) { /* noop */ }
            this.analyser = null;
        }
        this.mode = null;
        this.fileName = null;
        this.frame.level = this.frame.bass = this.frame.mid = this.frame.treble = 0;
        this.frame.beat = false;
    }

    update(dt) {
        if (!this.active || !this.analyser || !this._freqData) return;
        this.analyser.getByteFrequencyData(this._freqData);

        const bass = bandEnergy(this._freqData, BANDS.bass[0], BANDS.bass[1]);
        const mid = bandEnergy(this._freqData, BANDS.mid[0], BANDS.mid[1]);
        const treble = bandEnergy(this._freqData, BANDS.treble[0], BANDS.treble[1]);

        // RMS from time domain (0..1)
        this.analyser.getByteTimeDomainData(this._timeDomain);
        let sum = 0;
        const td = this._timeDomain;
        for (let i = 0; i < td.length; i++) {
            const v = (td[i] - 128) / 128;
            sum += v * v;
        }
        const level = Math.sqrt(sum / td.length) * 2;

        const s = SMOOTH;
        const f = this.frame;
        f.bass += (bass / 255 - f.bass) * s;
        f.mid += (mid / 255 - f.mid) * s;
        f.treble += (treble / 255 - f.treble) * s;
        f.level += (Math.min(1, level) - f.level) * s;

        // Beat on bass energy with cooldown
        const [beat] = detectBeat(f.bass, this._history);
        if (beat && this._lastBeatTime < 0) {
            this._lastBeatTime = 0;
            f.beat = true;
        } else if (this._lastBeatTime >= 0) {
            this._lastBeatTime += dt;
            if (this._lastBeatTime >= this._beatCooldown) {
                this._lastBeatTime = -1;
                f.beat = false;
            } else {
                f.beat = false;
            }
        }
        return f;
    }

    getFrame() { return this.frame; }
}