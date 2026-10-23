import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import {
	buildPairingCodeInput,
	buildSignedMessageText,
	pairingCodeFromDigest,
	type SignedMessageParams,
} from '../../../../common/trustProtocol';

/**
 * Ed25519 en JavaScript puro a proposito: el visor se sirve por HTTP en la
 * red local, que NO es un contexto seguro, y alli `crypto.subtle` no existe.
 * Limitacion conocida: la clave privada queda en el almacenamiento del sitio
 * (no "no-exportable" como con WebCrypto); mejora prevista al migrar a HTTPS.
 */

export interface StoredIdentity {
	version: 1;
	/** Clave privada Ed25519 (32 bytes) en base64url. */
	privateKey: string;
	/** Clave publica Ed25519 (32 bytes) en base64url. */
	publicKey: string;
	/** Se fija solo cuando el desktop confirma el emparejamiento. */
	pairedDeviceId?: string;
}

export interface KeyValueStore {
	get(key: string): Promise<unknown>;
	set(key: string, value: unknown): Promise<void>;
	remove(key: string): Promise<void>;
}

const IDENTITY_KEY = 'trusted-device-identity';

const toB64Url = (bytes: Uint8Array): string => {
	let binary = '';
	bytes.forEach((b) => {
		binary += String.fromCharCode(b);
	});
	return btoa(binary)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
};

const fromB64Url = (text: string): Uint8Array => {
	const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

function isValidIdentity(value: unknown): value is StoredIdentity {
	if (!value || typeof value !== 'object') return false;
	const v = value as Partial<StoredIdentity>;
	if (v.version !== 1) return false;
	if (typeof v.privateKey !== 'string' || typeof v.publicKey !== 'string') {
		return false;
	}
	try {
		const priv = fromB64Url(v.privateKey);
		return (
			priv.length === 32 && toB64Url(ed25519.getPublicKey(priv)) === v.publicKey
		);
	} catch {
		return false;
	}
}

export async function loadOrCreateIdentity(
	store: KeyValueStore,
): Promise<StoredIdentity> {
	const existing = await store.get(IDENTITY_KEY);
	if (isValidIdentity(existing)) return existing;

	const secret = ed25519.utils.randomPrivateKey();
	const identity: StoredIdentity = {
		version: 1,
		privateKey: toB64Url(secret),
		publicKey: toB64Url(ed25519.getPublicKey(secret)),
	};
	await store.set(IDENTITY_KEY, identity);
	return identity;
}

export async function saveIdentity(
	store: KeyValueStore,
	identity: StoredIdentity,
): Promise<void> {
	await store.set(IDENTITY_KEY, identity);
}

export function signChallenge(
	identity: StoredIdentity,
	params: SignedMessageParams,
): string {
	const message = new TextEncoder().encode(buildSignedMessageText(params));
	return toB64Url(ed25519.sign(message, fromB64Url(identity.privateKey)));
}

/** Codigo de 6 digitos que el usuario compara con el que muestra el desktop. */
export function computePairingCode(
	publicKey: string,
	pairingNonce: string,
): string {
	return pairingCodeFromDigest(
		sha256(
			new TextEncoder().encode(buildPairingCodeInput(publicKey, pairingNonce)),
		),
	);
}
