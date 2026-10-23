import { describe, it, expect, beforeEach } from 'vitest';
import {
	TrustedDevicesService,
	TrustedDevice,
	TrustedDevicesStorage,
} from '../features/TrustedDevicesService';
import { registerTrustedDeviceHandlers } from './trustedDeviceSocketHandlers';
import {
	runTrustHandshake,
	type TrustSocket,
} from '../client-viewer/src/features/TrustedDevice/trustHandshake';
import {
	loadOrCreateIdentity,
	computePairingCode,
	type KeyValueStore,
} from '../client-viewer/src/features/TrustedDevice/identity';

/**
 * Prueba de punta a punta del protocolo: el codigo REAL del visor (Ed25519 en
 * JS puro) contra el servicio y los manejadores REALES del servidor, unidos por
 * un socket en memoria. Si el formato de firma o de codigo diverge, falla aqui.
 */

class MemoryStorage implements TrustedDevicesStorage {
	saved: TrustedDevice[] = [];

	load() {
		return this.saved.map((d) => ({ ...d }));
	}

	save(devices: TrustedDevice[]) {
		this.saved = devices.map((d) => ({ ...d }));
	}
}

class MemoryKv implements KeyValueStore {
	data = new Map<string, unknown>();

	async get(key: string) {
		return this.data.get(key);
	}

	async set(key: string, value: unknown) {
		this.data.set(key, structuredClone(value));
	}

	async remove(key: string) {
		this.data.delete(key);
	}
}

type Listener = (payload: unknown) => void;

/** Par de sockets en memoria con entrega asincrona, como una red real. */
function createLoopback(socketId: string) {
	const toServer = new Map<string, Listener[]>();
	const toClient = new Map<string, Listener[]>();
	const deliver = (
		table: Map<string, Listener[]>,
		event: string,
		payload: unknown,
	) => setTimeout(() => (table.get(event) ?? []).forEach((l) => l(payload)), 0);
	const add = (table: Map<string, Listener[]>, event: string, l: Listener) =>
		table.set(event, [...(table.get(event) ?? []), l]);
	const remove = (table: Map<string, Listener[]>, event: string, l: Listener) =>
		table.set(
			event,
			(table.get(event) ?? []).filter((x) => x !== l),
		);

	const sent: { event: string; payload: unknown }[] = [];
	let tamper: ((event: string, payload: unknown) => unknown) | null = null;

	const client: TrustSocket = {
		emit: (event, payload) => {
			sent.push({ event, payload });
			deliver(toServer, event, tamper ? tamper(event, payload) : payload);
		},
		on: (event, l) => add(toClient, event, l),
		off: (event, l) => remove(toClient, event, l),
	};
	const server = {
		id: socketId,
		on: (event: string, l: Listener) => add(toServer, event, l),
		emit: (event: string, payload?: unknown) =>
			deliver(toClient, event, payload),
	};
	return {
		client,
		server,
		sent,
		setTamper: (fn: typeof tamper) => {
			tamper = fn;
		},
	};
}

describe('flujo completo visor <-> servidor', () => {
	const ROOM = '123456';
	const IP = '192.168.1.50';
	let clock: number;
	let storage: MemoryStorage;
	let service: TrustedDevicesService;
	let kv: MemoryKv;
	let socketCounter: number;

	beforeEach(() => {
		clock = 1_000_000;
		storage = new MemoryStorage();
		service = new TrustedDevicesService(storage, () => clock);
		kv = new MemoryKv();
		socketCounter = 0;
	});

	function connect(opts: { owner?: boolean; ip?: string; kvStore?: KeyValueStore } = {}) {
		const loop = createLoopback(`socket-${(socketCounter += 1)}`);
		registerTrustedDeviceHandlers({
			socket: loop.server,
			service,
			roomId: ROOM,
			isOwnerSocket: () => opts.owner ?? false,
			limitKey: () => opts.ip ?? IP,
		});
		const events = { code: null as string | null, paired: false };
		const handshake = () =>
			runTrustHandshake({
				socket: loop.client,
				roomId: ROOM,
				store: opts.kvStore ?? kv,
				deviceName: 'Chrome Android',
				timeoutMs: 80,
				onPairingCode: (c) => {
					events.code = c;
				},
				onPaired: () => {
					events.paired = true;
				},
			});
		return { loop, events, handshake };
	}

	const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

	/** Primera conexion + aprobacion humana con "recordar". */
	async function pairOnce() {
		const first = connect();
		const result = await first.handshake();
		expect(result.state).toBe('pairing');
		const confirmed = service.confirmPairing(first.loop.server.id);
		expect(confirmed).not.toBeNull();
		// Lo mismo que hace el handler IPC ConfirmDevicePairing.
		first.loop.server.emit('PAIR_CONFIRMED', { deviceId: confirmed!.id });
		await tick();
		return { first, device: confirmed! };
	}

	it('primera conexion: pide emparejar y ambos lados ven el MISMO codigo', async () => {
		const { loop, events, handshake } = connect();
		const result = await handshake();
		expect(result.state).toBe('pairing');
		expect(events.code).toMatch(/^\d{6}$/);

		const pending = service.getPendingPairing(loop.server.id)!;
		expect(pending).not.toBeNull();
		expect(pending.code).toBe(events.code); // interop cliente (noble) <-> servidor (node crypto)
		expect(service.list()).toHaveLength(0); // aun nada recordado sin aprobacion
	});

	it('tras aprobar, el visor guarda que esta emparejado', async () => {
		const { first, device } = await pairOnce();
		expect(first.events.paired).toBe(true);
		const identity = (await kv.get('trusted-device-identity')) as {
			pairedDeviceId?: string;
		};
		expect(identity.pairedDeviceId).toBe(device.id);
	});

	it('segunda conexion: se autentica con la firma y sin pedir emparejar', async () => {
		await pairOnce();
		const second = connect();
		const result = await second.handshake();
		expect(result.state).toBe('authenticated');
		expect(service.isSocketAuthenticated(second.loop.server.id, ROOM)).toBe(true);
		expect(second.loop.sent.map((s) => s.event)).toEqual([
			'AUTH_HELLO',
			'AUTH_RESPONSE',
		]); // no hubo PAIR_REQUEST
	});

	it('la autenticacion no se transfiere a otra conexion', async () => {
		await pairOnce();
		const second = connect();
		await second.handshake();
		const intruder = connect();
		expect(service.isSocketAuthenticated(intruder.loop.server.id, ROOM)).toBe(false);
	});

	it('si el desktop revoca el dispositivo, el visor vuelve a emparejar', async () => {
		const { device } = await pairOnce();
		service.revoke(device.id);
		const third = connect();
		const result = await third.handshake();
		expect(result.state).toBe('pairing');
		const identity = (await kv.get('trusted-device-identity')) as {
			pairedDeviceId?: string;
		};
		expect(identity.pairedDeviceId).toBeUndefined();
	});

	it('un dispositivo vencido vuelve a emparejar', async () => {
		await pairOnce();
		clock += 31 * 24 * 60 * 60_000;
		const result = await connect().handshake();
		expect(result.state).toBe('pairing');
	});

	it('mantiene la misma identidad entre conexiones', async () => {
		const a = await loadOrCreateIdentity(kv);
		await connect().handshake();
		const b = await loadOrCreateIdentity(kv);
		expect(b.publicKey).toBe(a.publicKey);
		expect(b.privateKey).toBe(a.privateKey);
	});

	it('regenera una identidad corrupta en vez de fallar', async () => {
		await kv.set('trusted-device-identity', {
			version: 1,
			privateKey: 'AAAA',
			publicKey: 'BBBB',
		});
		const identity = await loadOrCreateIdentity(kv);
		expect(identity.publicKey).toHaveLength(43);
	});

	it('si el servidor no responde, sigue sin bloquear (flujo normal)', async () => {
		const loop = createLoopback('mudo');
		const result = await runTrustHandshake({
			socket: loop.client,
			roomId: ROOM,
			store: kv,
			deviceName: 'x',
			timeoutMs: 30,
		});
		expect(result.state).toBe('unavailable');
	});

	it('el owner (localhost) no se autentica por este camino', async () => {
		await pairOnce();
		const owner = connect({ owner: true });
		const result = await owner.handshake();
		expect(result.state).toBe('unavailable');
		expect(service.isSocketAuthenticated(owner.loop.server.id, ROOM)).toBe(false);
	});

	it('si la IP esta bloqueada, no insiste con emparejar', async () => {
		await pairOnce();
		for (let i = 0; i < 5; i += 1) {
			service.issueChallenge({
				deviceId: 'basura',
				roomId: ROOM,
				socketId: 'x',
				limitKey: IP,
			});
		}
		const locked = connect();
		const result = await locked.handshake();
		expect(result.state).toBe('unavailable');
		expect(locked.loop.sent.map((s) => s.event)).not.toContain('PAIR_REQUEST');
	});

	it('detecta un intermediario que cambia la clave publica (codigos distintos)', async () => {
		const attackerKv = new MemoryKv();
		const attacker = await loadOrCreateIdentity(attackerKv);
		const { loop, events, handshake } = connect();
		// El atacante reemplaza la clave del visor por la suya en el camino.
		loop.setTamper((event, payload) =>
			event === 'PAIR_REQUEST'
				? { ...(payload as object), publicKey: attacker.publicKey }
				: payload,
		);
		await handshake();
		const desktopCode = service.getPendingPairing(loop.server.id)!.code;
		expect(events.code).not.toBe(desktopCode);
	});

	it('el codigo del cliente coincide con el calculado a mano', async () => {
		const { loop, events, handshake } = connect();
		await handshake();
		const pending = service.getPendingPairing(loop.server.id)!;
		const identity = await loadOrCreateIdentity(kv);
		expect(computePairingCode(identity.publicKey, pending.pairingNonce)).toBe(
			events.code,
		);
	});
});
