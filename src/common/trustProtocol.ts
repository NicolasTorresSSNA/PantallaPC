/**
 * Constantes y formato de mensaje compartidos entre el servidor (Node) y el
 * visor (navegador) del protocolo de dispositivos de confianza. Una sola
 * fuente de verdad: si el formato cambia, cambia en ambos lados a la vez.
 */

export const SIGNATURE_DOMAIN = 'deskreen-trust-v1';

export interface SignedMessageParams {
	deviceId: string;
	roomId: string;
	challengeId: string;
	nonce: string;
}

/** Texto exacto que firma el visor. Ata la firma al dispositivo, sala y desafio. */
export function buildSignedMessageText(params: SignedMessageParams): string {
	const { deviceId, roomId, challengeId, nonce } = params;
	return [SIGNATURE_DOMAIN, deviceId, roomId, challengeId, nonce].join('\n');
}

/** Texto del que se deriva el codigo comparable de emparejamiento. */
export function buildPairingCodeInput(
	publicKey: string,
	pairingNonce: string,
): string {
	return `${SIGNATURE_DOMAIN}-pair\n${publicKey}\n${pairingNonce}`;
}

/** 6 digitos a partir de los primeros 4 bytes (big endian) de un sha256. */
export function pairingCodeFromDigest(digest: Uint8Array): string {
	const n =
		((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>>
		0;
	return String(n % 1_000_000).padStart(6, '0');
}

export type TrustFailureReason =
	| 'locked-out'
	| 'unknown-challenge'
	| 'expired'
	| 'unknown-device'
	| 'device-expired'
	| 'bad-signature';

export interface AuthChallengeMessage {
	challengeId: string;
	nonce: string;
	expiresAt: number;
}

export type AuthResultMessage =
	| { ok: true }
	| { ok: false; reason: TrustFailureReason };

export interface PairPendingMessage {
	code: string;
	pairingNonce: string;
}

export interface PairConfirmedMessage {
	deviceId: string;
}
