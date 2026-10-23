import {
	loadOrCreateIdentity,
	saveIdentity,
	signChallenge,
	computePairingCode,
	type KeyValueStore,
} from './identity';
import type {
	AuthChallengeMessage,
	AuthResultMessage,
	PairConfirmedMessage,
	PairPendingMessage,
} from '../../../../common/trustProtocol';

/** Parte minima de socket.io-client que usa el protocolo (facilita los tests). */
export interface TrustSocket {
	emit(event: string, ...args: unknown[]): unknown;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	on(event: string, listener: (...args: any[]) => void): unknown;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	off(event: string, listener: (...args: any[]) => void): unknown;
}

export type TrustHandshakeState =
	| 'authenticated' // reconocido: el desktop no pedira "Permitir"
	| 'pairing' // desconocido: se pidio emparejar, hay codigo para comparar
	| 'unavailable'; // sin soporte, bloqueado o sin respuesta: flujo normal

export interface TrustHandshakeResult {
	state: TrustHandshakeState;
	pairingCode?: string;
}

export interface TrustHandshakeOptions {
	socket: TrustSocket;
	roomId: string;
	store: KeyValueStore;
	deviceName: string;
	/** Se llama cuando hay un codigo de emparejamiento para mostrar al usuario. */
	onPairingCode?: (code: string) => void;
	/** Se llama cuando el desktop confirma que recordara este dispositivo. */
	onPaired?: () => void;
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 4000;

function waitForAny<T>(
	socket: TrustSocket,
	events: string[],
	timeoutMs: number,
): Promise<{ event: string; data: T } | null> {
	return new Promise((resolve) => {
		const listeners = new Map<string, (data: T) => void>();
		const finish = (value: { event: string; data: T } | null) => {
			clearTimeout(timer);
			listeners.forEach((l, ev) => socket.off(ev, l));
			resolve(value);
		};
		const timer = setTimeout(() => finish(null), timeoutMs);
		events.forEach((event) => {
			const listener = (data: T) => finish({ event, data });
			listeners.set(event, listener);
			socket.on(event, listener);
		});
	});
}

/**
 * Corre ANTES de USER_ENTER. Nunca lanza ni espera mas de `timeoutMs` por
 * paso: ante cualquier problema el visor sigue con el flujo normal (con el
 * dialogo "Permitir"), que es el comportamiento seguro por defecto.
 */
export async function runTrustHandshake(
	opts: TrustHandshakeOptions,
): Promise<TrustHandshakeResult> {
	const { socket, roomId, store, deviceName, onPairingCode, onPaired } = opts;
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	try {
		let identity = await loadOrCreateIdentity(store);

		socket.on('PAIR_CONFIRMED', async (msg: PairConfirmedMessage) => {
			if (typeof msg?.deviceId !== 'string') return;
			identity = { ...identity, pairedDeviceId: msg.deviceId };
			try {
				await saveIdentity(store, identity);
				onPaired?.();
			} catch {
				// sin almacenamiento: simplemente no se recordara
			}
		});

		if (identity.pairedDeviceId) {
			const deviceId = identity.pairedDeviceId;
			socket.emit('AUTH_HELLO', { deviceId });
			const first = await waitForAny<AuthChallengeMessage | AuthResultMessage>(
				socket,
				['AUTH_CHALLENGE', 'AUTH_RESULT'],
				timeoutMs,
			);

			if (!first) return { state: 'unavailable' };

			if (first.event === 'AUTH_CHALLENGE') {
				const challenge = first.data as AuthChallengeMessage;
				socket.emit('AUTH_RESPONSE', {
					challengeId: challenge.challengeId,
					signature: signChallenge(identity, {
						deviceId,
						roomId,
						challengeId: challenge.challengeId,
						nonce: challenge.nonce,
					}),
				});
				const result = await waitForAny<AuthResultMessage>(
					socket,
					['AUTH_RESULT'],
					timeoutMs,
				);
				if (!result) return { state: 'unavailable' };
				if (result.data.ok) return { state: 'authenticated' };
				if (result.data.reason === 'locked-out') {
					return { state: 'unavailable' };
				}
			} else {
				const result = first.data as AuthResultMessage;
				if (!result.ok && result.reason === 'locked-out') {
					return { state: 'unavailable' };
				}
			}

			// El desktop ya no nos conoce (revocado o vencido): a emparejar de nuevo.
			identity = { ...identity, pairedDeviceId: undefined };
			await saveIdentity(store, identity);
		}

		socket.emit('PAIR_REQUEST', {
			publicKey: identity.publicKey,
			name: deviceName,
		});
		const pairing = await waitForAny<PairPendingMessage | undefined>(
			socket,
			['PAIR_PENDING', 'PAIR_REJECTED'],
			timeoutMs,
		);
		if (pairing?.event !== 'PAIR_PENDING' || !pairing.data) {
			return { state: 'unavailable' };
		}
		const code = computePairingCode(
			identity.publicKey,
			pairing.data.pairingNonce,
		);
		onPairingCode?.(code);
		return { state: 'pairing', pairingCode: code };
	} catch {
		return { state: 'unavailable' };
	}
}
