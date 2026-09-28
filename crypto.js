/* ============================================================
   crypto.js - تشفير AES-GCM + اشتقاق مفتاح PBKDF2
   ============================================================ */
'use strict';

const Crypto = {
    key: null,
    _keyBytes: null,
    SALT_STORAGE: 'clinic_kdf_salt_v1',
    VERIFIER_STORAGE: 'clinic_pin_verifier_v1',
    ITERATIONS: 250000,
    _verifierPlain: 'clinic_unlock_verifier_v1',

    isSupported() {
        return typeof window.crypto !== 'undefined'
            && window.crypto.subtle
            && typeof window.crypto.subtle.importKey === 'function';
    },

    _getSalt() {
        let b64 = localStorage.getItem(this.SALT_STORAGE);
        if (!b64) {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            b64 = this._b64encode(salt);
            localStorage.setItem(this.SALT_STORAGE, b64);
        }
        return this._b64decode(b64);
    },

    async setupPin(pin) {
        if (!this.isSupported()) throw new Error('Web Crypto غير مدعوم في هذا المتصفح');
        if (!pin || pin.length < 4) throw new Error('الرقم السري يجب أن يكون 4 أرقام على الأقل');
        if (!/^\d+$/.test(pin)) throw new Error('الرقم السري يجب أن يحتوي أرقاماً فقط');

        const salt = this._getSalt();
        const baseKey = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(pin),
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );
        const derivedBits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: this.ITERATIONS, hash: 'SHA-256' },
            baseKey,
            256
        );
        const key = await crypto.subtle.importKey(
            'raw',
            derivedBits,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        this.key = key;
        this._keyBytes = new Uint8Array(derivedBits);

        const verifier = await this.encrypt(this._verifierPlain);
        localStorage.setItem(this.VERIFIER_STORAGE, JSON.stringify(verifier));
        return true;
    },

    async unlockWithPin(pin) {
        if (!this.isSupported()) throw new Error('Web Crypto غير مدعوم');
        const verifierJSON = localStorage.getItem(this.VERIFIER_STORAGE);
        if (!verifierJSON) return this.setupPin(pin);

        const salt = this._getSalt();
        const baseKey = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(pin),
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );
        const derivedBits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: this.ITERATIONS, hash: 'SHA-256' },
            baseKey,
            256
        );
        const key = await crypto.subtle.importKey(
            'raw',
            derivedBits,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        this.key = key;
        this._keyBytes = new Uint8Array(derivedBits);

        try {
            const verifier = JSON.parse(verifierJSON);
            const plain = await this.decrypt(verifier);
            if (plain !== this._verifierPlain) throw new Error('bad');
            return true;
        } catch {
            this.key = null;
            this._keyBytes = null;
            throw new Error('الرقم السري غير صحيح');
        }
    },

    hasPin() {
        return !!localStorage.getItem(this.VERIFIER_STORAGE);
    },

    lock() {
        this.key = null;
        this._keyBytes = null;
    },

    isUnlocked() {
        return !!this.key;
    },

    async encrypt(plaintext) {
        if (!this.key) throw new Error('التطبيق مقفل');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(String(plaintext));
        const ct = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            this.key,
            encoded
        );
        return { iv: this._b64encode(iv), ct: this._b64encode(new Uint8Array(ct)) };
    },

    async decrypt(payload) {
        if (!this.key) throw new Error('التطبيق مقفل');
        const iv = this._b64decode(payload.iv);
        const ct = this._b64decode(payload.ct);
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            this.key,
            ct
        );
        return new TextDecoder().decode(plain);
    },

    async encryptJSON(obj) {
        return this.encrypt(JSON.stringify(obj));
    },

    async decryptJSON(payload) {
        const text = await this.decrypt(payload);
        return JSON.parse(text);
    },

    _b64encode(bytes) {
        let s = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(s);
    },

    _b64decode(b64) {
        const raw = atob(b64);
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    }
};

window.Crypto = Crypto;