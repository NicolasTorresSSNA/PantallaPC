import crypto from 'crypto';
import {
	SIGNATURE_DOMAIN,
	buildPairingCodeInput,
	buildSignedMessageText,
	pairingCodeFromDigest,
} from '../../common/trustProtocol';

export { SIGNATURE_DOMAIN };

/**
 * Dispositivos de confianza: el visor (celular) guarda una clave privada
 * Ed25519; el desktop guarda solo la clave publica. Para reconectar sin el
 * dialogo "Permitir", el visor firma un desafio de un solo uso.
 *
 * Esta clase es pura (sin Electron): la persistencia y el reloj se inyectan.
 */

const CHALLENGE_TTL_MS = 30_000;
const PAIRING_TTL_MS = 5 * 60_000;
const DEFAULT_DEVICE_TTL_MS = 30 * 24 * 60 * 60_000;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 60_000;
const LOCKOUT_MS = 5 * 60_000;
const MAX_NAME_LENGTH = 64;

export interface TrustedDevice {
	/** Huella de la clave publica (sha256, 32 hex). No lo elige el cliente. */
	id: string;
	name: string;
	/** Clave publica Ed25519 cruda (32 bytes) en base64url. */
	publicKey: string;
	createdAt: number;
	lastSeenAt: number;
	/** null = no vence. */
	expiresAt: number | null;
}

export interface TrustedDevicesStorage {
	load(): TrustedDevice[];
	save(devices: TrustedDevice[]): void;
}

export interface Challenge {
	challengeId: string;
	nonce: string;
	expiresAt: number;
}

export type VerifyFailureReason =
	| 'locked-out'
	| 'unknown-challenge'
	| 'expired'
	| 'unknown-device'
	| 'device-expired'
	| 'bad-signature';

export type VerifyResult =
	| { ok: true; device: TrustedDevice }
	| { ok: false; reason: VerifyFailureReason };

export type HelloResult =
	| { ok: true; challenge: Challenge }
	| { ok: false; reason: 'locked-out' | 'unknown-device' | 'device-expired' };

export interface PendingPairing {
	socketId: string;
	roomId: string;
	name: string;
	publicKey: string;
	/** Codigo de 6 digitos que ambos lados muestran para compararlo. */
	code: string;
	pairingNonce: string;
	expiresAt: number;
}

interface IssuedChallenge {
	deviceId: string;
	roomId: string;
	socketId: string;
	nonce: string;
	expiresAt: number;
}

interface FailureRecord {
	timestamps: number[];
	lockedUntil: number;
}

const b64url = (buf: Buffer): string => buf.toString('base64url');

export function fingerprintOfPublicKey(publicKey: string): string {
	return crypto
		.createHash('sha256')
		.update(Buffer.from(publicKey, 'base64url'))
		.digest('hex')
		.slice(0, 32);
}

function toPublicKeyObject(publicKey: string): crypto.KeyObject | null {
	try {
		const raw = Buffer.from(publicKey, 'base64url');
		if (raw.length !== 32) return null;
		return crypto.createPublicKey({
			key: { kty: 'OKP', crv: 'Ed25519', x: publicKey },
			format: 'jwk',
		});
	} catch {
		return null;
	}
}

/** Mensaje exacto que firma el visor (formato compartido en common/trustProtocol). */
export function buildSignedMessage(params: {
	deviceId: string;
	roomId: string;
	challengeId: string;
	nonce: string;
}): Buffer {
	return Buffer.from(buildSignedMessageText(params), 'utf8');
}

/** Codigo comparable (6 digitos) derivado de la clave publica y el nonce de emparejamiento. */
export function pairingCode(publicKey: string, pairingNonce: string): string {
	return pairingCodeFromDigest(
		crypto
			.createHash('sha256')
			.update(buildPairingCodeInput(publicKey, pairingNonce))
			.digest(),
	);
}

export class TrustedDevicesService {
	private devices = new Map<string, TrustedDevice>();

	private challenges = new Map<string, IssuedChallenge>();

	private pairings = new Map<string, PendingPairing>();

	/** socketId -> dispositivo autenticado en una sala. */
	private authenticatedSockets = new Map<
		string,
		{ deviceId: string; roomId: string }
	>();

	private failures = new Map<string, FailureRecord>();

	constructor(
		private readonly storage: TrustedDevicesStorage,
		private readonly now: () => number = Date.now,
	) {
		for (const device of storage.load()) {
			if (toPublicKeyObject(device.publicKey)) {
				this.devices.set(device.id, device);
			}
		}
	}

	list(): TrustedDevice[] {
		return [...this.devices.values()].map((d) => ({ ...d }));
	}

	revoke(deviceId: string): boolean {
		const removed = this.devices.delete(deviceId);
		if (removed) {
			for (const [socketId, auth] of this.authenticatedSockets) {
				if (auth.deviceId === deviceId) this.authenticatedSockets.delete(socketId);
			}
			this.persist();
		}
		return removed;
	}

	/* ---------------- limite de intentos fallidos ---------------- */

	isLockedOut(key: string): boolean {
		const record = this.failures.get(key);
		return !!record && record.lockedUntil > this.now();
	}

	private recordFailure(key: string): void {
		const now = this.now();
		const record = this.failures.get(key) ?? { timestamps: [], lockedUntil: 0 };
		record.timestamps = record.timestamps.filter(
			(t) => now - t < FAILURE_WINDOW_MS,
		);
		record.timestamps.push(now);
		if (record.timestamps.length >= MAX_FAILURES) {
			record.lockedUntil = now + LOCKOUT_MS;
			record.timestamps = [];
		}
		this.failures.set(key, record);
	}

	private clearFailures(key: string): void {
		this.failures.delete(key);
	}

	/* ---------------- desafio / firma ---------------- */

	/** `limitKey`: normalmente la IP del cliente. */
	issueChallenge(params: {
		deviceId: string;
		roomId: string;
		socketId: string;
		limitKey: string;
	}): HelloResult {
		const { deviceId, roomId, socketId, limitKey } = params;
		if (this.isLockedOut(limitKey)) return { ok: false, reason: 'locked-out' };

		const device = this.devices.get(deviceId);
		if (!device) {
			this.recordFailure(limitKey);
			return { ok: false, reason: 'unknown-device' };
		}
		if (this.isExpired(device)) return { ok: false, reason: 'device-expired' };

		this.purgeExpiredChallenges();
		const challengeId = b64url(crypto.randomBytes(16));
		const nonce = b64url(crypto.randomBytes(32));
		const expiresAt = this.now() + CHALLENGE_TTL_MS;
		this.challenges.set(challengeId, {
			deviceId,
			roomId,
			socketId,
			nonce,
			expiresAt,
		});
		return { ok: true, challenge: { challengeId, nonce, expiresAt } };
	}

	verifyResponse(params: {
		socketId: string;
		challengeId: string;
		signature: string;
		limitKey: string;
	}): VerifyResult {
		const { socketId, challengeId, signature, limitKey } = params;
		if (this.isLockedOut(limitKey)) return { ok: false, reason: 'locked-out' };

		const issued = this.challenges.get(challengeId);
		// Un solo uso, y solo el mismo socket que lo recibio puede responderlo.
		if (!issued || issued.socketId !== socketId) {
			this.recordFailure(limitKey);
			return { ok: false, reason: 'unknown-challenge' };
		}
		this.challenges.delete(challengeId);
		if (issued.expiresAt <= this.now()) return { ok: false, reason: 'expired' };

		const device = this.devices.get(issued.deviceId);
		if (!device) return { ok: false, reason: 'unknown-device' };
		if (this.isExpired(device)) return { ok: false, reason: 'device-expired' };

		const keyObject = toPublicKeyObject(device.publicKey);
		let valid = false;
		try {
			valid =
				!!keyObject &&
				crypto.verify(
					null,
					buildSignedMessage({
						deviceId: device.id,
						roomId: issued.roomId,
						challengeId,
						nonce: issued.nonce,
					}),
					keyObject,
					Buffer.from(signature, 'base64url'),
				);
		} catch {
			valid = false;
		}
		if (!valid) {
			this.recordFailure(limitKey);
			return { ok: false, reason: 'bad-signature' };
		}

		this.clearFailures(limitKey);
		device.lastSeenAt = this.now();
		this.authenticatedSockets.set(socketId, {
			deviceId: device.id,
			roomId: issued.roomId,
		});
		this.persist();
		return { ok: true, device: { ...device } };
	}

	isSocketAuthenticated(socketId: string, roomId: string): boolean {
		const auth = this.authenticatedSockets.get(socketId);
		if (!auth || auth.roomId !== roomId) return false;
		const device = this.devices.get(auth.deviceId);
		return !!device && !this.isExpired(device);
	}

	clearSocket(socketId: string): void {
		this.authenticatedSockets.delete(socketId);
		this.pairings.delete(socketId);
		for (const [id, c] of this.challenges) {
			if (c.socketId === socketId) this.challenges.delete(id);
		}
	}

	/* ---------------- emparejamiento (requiere aprobacion humana) ---------------- */

	startPairing(params: {
		socketId: string;
		roomId: string;
		publicKey: string;
		name: string;
		limitKey: string;
	}): PendingPairing | null {
		const { socketId, roomId, publicKey, name, limitKey } = params;
		if (this.isLockedOut(limitKey)) return null;
		if (!toPublicKeyObject(publicKey)) {
			this.recordFailure(limitKey);
			return null;
		}
		const pairingNonce = b64url(crypto.randomBytes(16));
		const pairing: PendingPairing = {
			socketId,
			roomId,
			publicKey,
			name: name.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, MAX_NAME_LENGTH),
			pairingNonce,
			code: pairingCode(publicKey, pairingNonce),
			expiresAt: this.now() + PAIRING_TTL_MS,
		};
		this.pairings.set(socketId, pairing);
		return pairing;
	}

	getPendingPairing(socketId: string): PendingPairing | null {
		const pairing = this.pairings.get(socketId);
		if (!pairing || pairing.expiresAt <= this.now()) {
			this.pairings.delete(socketId);
			return null;
		}
		return pairing;
	}

	/** Llamar SOLO tras la aprobacion explicita del usuario en el desktop. */
	confirmPairing(
		socketId: string,
		options: { ttlMs?: number | null } = {},
	): TrustedDevice | null {
		const pairing = this.getPendingPairing(socketId);
		if (!pairing) return null;
		this.pairings.delete(socketId);

		const now = this.now();
		const ttl =
			options.ttlMs === undefined ? DEFAULT_DEVICE_TTL_MS : options.ttlMs;
		const device: TrustedDevice = {
			id: fingerprintOfPublicKey(pairing.publicKey),
			name: pairing.name || 'Dispositivo',
			publicKey: pairing.publicKey,
			createdAt: now,
			lastSeenAt: now,
			expiresAt: ttl === null ? null : now + ttl,
		};
		this.devices.set(device.id, device);
		this.persist();
		return { ...device };
	}

	/* ---------------- internos ---------------- */

	private isExpired(device: TrustedDevice): boolean {
		return device.expiresAt !== null && device.expiresAt <= this.now();
	}

	private purgeExpiredChallenges(): void {
		const now = this.now();
		for (const [id, c] of this.challenges) {
			if (c.expiresAt <= now) this.challenges.delete(id);
		}
	}

	private persist(): void {
		this.storage.save([...this.devices.values()]);
	}
}
