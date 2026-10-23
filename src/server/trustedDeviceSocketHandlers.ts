import type { TrustedDevicesService } from '../features/TrustedDevicesService';

/** Parte minima de un socket de socket.io que necesitan los manejadores. */
export interface TrustedDeviceSocket {
	id: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	on(event: string, listener: (payload: any) => void): unknown;
	emit(event: string, ...args: unknown[]): unknown;
}

export interface TrustedDeviceHandlersContext {
	socket: TrustedDeviceSocket;
	service: TrustedDevicesService;
	/** Sala (id original, el mismo que el visor usa en su URL). */
	roomId: string;
	/** El owner (desktop, localhost) nunca se autentica por este camino. */
	isOwnerSocket: () => boolean;
	/** Clave para el limite de intentos (normalmente la IP del visor). */
	limitKey: () => string;
}

/**
 * Reconexion sin dialogo: el visor ya emparejado firma un desafio.
 * Eventos: AUTH_HELLO -> AUTH_CHALLENGE | AUTH_RESULT,
 *          AUTH_RESPONSE -> AUTH_RESULT,
 *          PAIR_REQUEST -> PAIR_PENDING | PAIR_REJECTED.
 */
export function registerTrustedDeviceHandlers(
	ctx: TrustedDeviceHandlersContext,
): void {
	const { socket, service, roomId, isOwnerSocket, limitKey } = ctx;

	socket.on('AUTH_HELLO', (payload) => {
		if (isOwnerSocket() || typeof payload?.deviceId !== 'string') return;
		const result = service.issueChallenge({
			deviceId: payload.deviceId,
			roomId,
			socketId: socket.id,
			limitKey: limitKey(),
		});
		if (result.ok) {
			socket.emit('AUTH_CHALLENGE', result.challenge);
		} else {
			socket.emit('AUTH_RESULT', { ok: false, reason: result.reason });
		}
	});

	socket.on('AUTH_RESPONSE', (payload) => {
		if (
			isOwnerSocket() ||
			typeof payload?.challengeId !== 'string' ||
			typeof payload?.signature !== 'string'
		) {
			return;
		}
		const result = service.verifyResponse({
			socketId: socket.id,
			challengeId: payload.challengeId,
			signature: payload.signature,
			limitKey: limitKey(),
		});
		socket.emit(
			'AUTH_RESULT',
			result.ok ? { ok: true } : { ok: false, reason: result.reason },
		);
	});

	socket.on('PAIR_REQUEST', (payload) => {
		if (
			isOwnerSocket() ||
			typeof payload?.publicKey !== 'string' ||
			typeof payload?.name !== 'string'
		) {
			return;
		}
		const pairing = service.startPairing({
			socketId: socket.id,
			roomId,
			publicKey: payload.publicKey,
			name: payload.name,
			limitKey: limitKey(),
		});
		if (pairing) {
			socket.emit('PAIR_PENDING', {
				code: pairing.code,
				pairingNonce: pairing.pairingNonce,
			});
		} else {
			socket.emit('PAIR_REJECTED');
		}
	});
}
