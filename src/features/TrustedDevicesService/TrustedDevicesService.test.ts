import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import {
	TrustedDevicesService,
	TrustedDevice,
	TrustedDevicesStorage,
	buildSignedMessage,
	fingerprintOfPublicKey,
	pairingCode,
} from './index';
import { FileTrustedDevicesStorage } from './fileStorage';

class MemoryStorage implements TrustedDevicesStorage {
	saved: TrustedDevice[] = [];

	load(): TrustedDevice[] {
		return this.saved.map((d) => ({ ...d }));
	}

	save(devices: TrustedDevice[]): void {
		this.saved = devices.map((d) => ({ ...d }));
	}
}

/** Simula al visor usando WebCrypto (lo mismo que hara el navegador del celular). */
async function createViewer() {
	const keyPair = (await crypto.subtle.generateKey('Ed25519', true, [
		'sign',
		'verify',
	])) as CryptoKeyPair;
	const raw = Buffer.from(await crypto.subtle.exportKey('raw', keyPair.publicKey));
	const publicKey = raw.toString('base64url');
	return {
		publicKey,
		id: fingerprintOfPublicKey(publicKey),
		async sign(message: Buffer): Promise<string> {
			const sig = await crypto.subtle.sign(
				'Ed25519',
				keyPair.privateKey,
				new Uint8Array(message),
			);
			return Buffer.from(sig).toString('base64url');
		},
	};
}

describe('TrustedDevicesService', () => {
	let clock: number;
	let storage: MemoryStorage;
	let service: TrustedDevicesService;
	const ROOM = '123456';
	const SOCKET = 'socket-A';
	const IP = '192.168.1.50';

	const newService = () => new TrustedDevicesService(storage, () => clock);

	async function pair(
		viewer: Awaited<ReturnType<typeof createViewer>>,
		socketId = SOCKET,
		ttlMs?: number | null,
	) {
		const pairing = service.startPairing({
			socketId,
			roomId: ROOM,
			publicKey: viewer.publicKey,
			name: 'Mi celular',
			limitKey: IP,
		});
		expect(pairing).not.toBeNull();
		return service.confirmPairing(socketId, { ttlMs })!;
	}

	async function authenticate(
		viewer: Awaited<ReturnType<typeof createViewer>>,
		opts: { socketId?: string; roomId?: string; signRoomId?: string } = {},
	) {
		const socketId = opts.socketId ?? SOCKET;
		const roomId = opts.roomId ?? ROOM;
		const hello = service.issueChallenge({
			deviceId: viewer.id,
			roomId,
			socketId,
			limitKey: IP,
		});
		if (!hello.ok) return { hello, result: null };
		const signature = await viewer.sign(
			buildSignedMessage({
				deviceId: viewer.id,
				roomId: opts.signRoomId ?? roomId,
				challengeId: hello.challenge.challengeId,
				nonce: hello.challenge.nonce,
			}),
		);
		const result = service.verifyResponse({
			socketId,
			challengeId: hello.challenge.challengeId,
			signature,
			limitKey: IP,
		});
		return { hello, result, signature };
	}

	beforeEach(() => {
		clock = 1_000_000;
		storage = new MemoryStorage();
		service = newService();
	});

	describe('emparejamiento', () => {
		it('rechaza claves publicas invalidas', () => {
			for (const publicKey of ['', 'abc', Buffer.alloc(31).toString('base64url')]) {
				expect(
					service.startPairing({
						socketId: SOCKET,
						roomId: ROOM,
						publicKey,
						name: 'x',
						limitKey: IP,
					}),
				).toBeNull();
			}
		});

		it('no registra nada sin confirmacion humana', async () => {
			const viewer = await createViewer();
			service.startPairing({
				socketId: SOCKET,
				roomId: ROOM,
				publicKey: viewer.publicKey,
				name: 'Mi celular',
				limitKey: IP,
			});
			expect(service.list()).toHaveLength(0);
			expect(storage.saved).toHaveLength(0);
		});

		it('confirmar registra con id = huella de la clave (no elegido por el cliente)', async () => {
			const viewer = await createViewer();
			const device = await pair(viewer);
			expect(device.id).toBe(viewer.id);
			expect(device.id).toHaveLength(32);
			expect(storage.saved).toHaveLength(1);
			expect(service.list()[0].name).toBe('Mi celular');
		});

		it('confirmar sin emparejamiento pendiente devuelve null', () => {
			expect(service.confirmPairing('nadie')).toBeNull();
		});

		it('el emparejamiento pendiente vence', async () => {
			const viewer = await createViewer();
			service.startPairing({
				socketId: SOCKET,
				roomId: ROOM,
				publicKey: viewer.publicKey,
				name: 'x',
				limitKey: IP,
			});
			clock += 5 * 60_000 + 1;
			expect(service.confirmPairing(SOCKET)).toBeNull();
		});

		it('sanea el nombre y limita su largo', async () => {
			const viewer = await createViewer();
			const pairing = service.startPairing({
				socketId: SOCKET,
				roomId: ROOM,
				publicKey: viewer.publicKey,
				name: `<script>alert(1)</script>${'a'.repeat(200)}`,
				limitKey: IP,
			})!;
			expect(pairing.name).not.toMatch(/[<>()]/);
			expect(pairing.name.length).toBeLessThanOrEqual(64);
		});

		it('el codigo comparable son 6 digitos y es determinista', async () => {
			const viewer = await createViewer();
			const a = pairingCode(viewer.publicKey, 'nonce');
			expect(a).toMatch(/^\d{6}$/);
			expect(pairingCode(viewer.publicKey, 'nonce')).toBe(a);
			expect(pairingCode(viewer.publicKey, 'otro')).not.toBe(a);
		});
	});

	describe('desafio / firma', () => {
		it('un dispositivo emparejado se autentica con una firma WebCrypto valida', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			const { result } = await authenticate(viewer);
			expect(result).toMatchObject({ ok: true });
			expect(service.isSocketAuthenticated(SOCKET, ROOM)).toBe(true);
		});

		it('la autenticacion vale solo para la sala del desafio', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			await authenticate(viewer);
			expect(service.isSocketAuthenticated(SOCKET, 'otra-sala')).toBe(false);
			expect(service.isSocketAuthenticated('otro-socket', ROOM)).toBe(false);
		});

		it('un dispositivo desconocido no recibe desafio', async () => {
			const stranger = await createViewer();
			const hello = service.issueChallenge({
				deviceId: stranger.id,
				roomId: ROOM,
				socketId: SOCKET,
				limitKey: IP,
			});
			expect(hello).toEqual({ ok: false, reason: 'unknown-device' });
		});

		it('rechaza una firma hecha con otra clave', async () => {
			const viewer = await createViewer();
			const attacker = await createViewer();
			await pair(viewer);
			const hello = service.issueChallenge({
				deviceId: viewer.id,
				roomId: ROOM,
				socketId: SOCKET,
				limitKey: IP,
			});
			if (!hello.ok) throw new Error('esperaba desafio');
			const forged = await attacker.sign(
				buildSignedMessage({
					deviceId: viewer.id,
					roomId: ROOM,
					challengeId: hello.challenge.challengeId,
					nonce: hello.challenge.nonce,
				}),
			);
			const result = service.verifyResponse({
				socketId: SOCKET,
				challengeId: hello.challenge.challengeId,
				signature: forged,
				limitKey: IP,
			});
			expect(result).toEqual({ ok: false, reason: 'bad-signature' });
			expect(service.isSocketAuthenticated(SOCKET, ROOM)).toBe(false);
		});

		it('la firma esta atada a la sala (no sirve para otra sala)', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			const { result } = await authenticate(viewer, { signRoomId: 'sala-ajena' });
			expect(result).toEqual({ ok: false, reason: 'bad-signature' });
		});

		it('el desafio es de un solo uso (anti-replay)', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			const first = await authenticate(viewer);
			expect(first.result).toMatchObject({ ok: true });
			const replay = service.verifyResponse({
				socketId: SOCKET,
				challengeId: first.hello.ok ? first.hello.challenge.challengeId : '',
				signature: first.signature!,
				limitKey: IP,
			});
			expect(replay).toEqual({ ok: false, reason: 'unknown-challenge' });
		});

		it('otro socket no puede responder un desafio ajeno', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			const hello = service.issueChallenge({
				deviceId: viewer.id,
				roomId: ROOM,
				socketId: SOCKET,
				limitKey: IP,
			});
			if (!hello.ok) throw new Error('esperaba desafio');
			const signature = await viewer.sign(
				buildSignedMessage({
					deviceId: viewer.id,
					roomId: ROOM,
					challengeId: hello.challenge.challengeId,
					nonce: hello.challenge.nonce,
				}),
			);
			const result = service.verifyResponse({
				socketId: 'socket-intruso',
				challengeId: hello.challenge.challengeId,
				signature,
				limitKey: '10.0.0.9',
			});
			expect(result).toEqual({ ok: false, reason: 'unknown-challenge' });
		});

		it('el desafio vence a los 30 s', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			const hello = service.issueChallenge({
				deviceId: viewer.id,
				roomId: ROOM,
				socketId: SOCKET,
				limitKey: IP,
			});
			if (!hello.ok) throw new Error('esperaba desafio');
			const signature = await viewer.sign(
				buildSignedMessage({
					deviceId: viewer.id,
					roomId: ROOM,
					challengeId: hello.challenge.challengeId,
					nonce: hello.challenge.nonce,
				}),
			);
			clock += 30_001;
			const result = service.verifyResponse({
				socketId: SOCKET,
				challengeId: hello.challenge.challengeId,
				signature,
				limitKey: IP,
			});
			expect(result).toEqual({ ok: false, reason: 'expired' });
		});

		it('una firma basura no lanza excepcion', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			const hello = service.issueChallenge({
				deviceId: viewer.id,
				roomId: ROOM,
				socketId: SOCKET,
				limitKey: IP,
			});
			if (!hello.ok) throw new Error('esperaba desafio');
			const result = service.verifyResponse({
				socketId: SOCKET,
				challengeId: hello.challenge.challengeId,
				signature: '***no-base64***',
				limitKey: IP,
			});
			expect(result).toEqual({ ok: false, reason: 'bad-signature' });
		});
	});

	describe('vigencia y revocacion', () => {
		it('un dispositivo vencido no se autentica', async () => {
			const viewer = await createViewer();
			await pair(viewer, SOCKET, 60_000);
			clock += 60_001;
			const { hello } = await authenticate(viewer);
			expect(hello).toEqual({ ok: false, reason: 'device-expired' });
		});

		it('ttl null = no vence', async () => {
			const viewer = await createViewer();
			const device = await pair(viewer, SOCKET, null);
			expect(device.expiresAt).toBeNull();
			clock += 10 * 365 * 24 * 60 * 60_000;
			const { result } = await authenticate(viewer);
			expect(result).toMatchObject({ ok: true });
		});

		it('revocar corta sesiones activas y persiste', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			await authenticate(viewer);
			expect(service.revoke(viewer.id)).toBe(true);
			expect(service.isSocketAuthenticated(SOCKET, ROOM)).toBe(false);
			expect(storage.saved).toHaveLength(0);
			const { hello } = await authenticate(viewer);
			expect(hello).toEqual({ ok: false, reason: 'unknown-device' });
			expect(service.revoke(viewer.id)).toBe(false);
		});

		it('clearSocket olvida la autenticacion del socket', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			await authenticate(viewer);
			service.clearSocket(SOCKET);
			expect(service.isSocketAuthenticated(SOCKET, ROOM)).toBe(false);
		});

		it('actualiza lastSeenAt al autenticarse', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			clock += 5_000;
			await authenticate(viewer);
			expect(service.list()[0].lastSeenAt).toBe(clock);
		});
	});

	describe('limite de intentos', () => {
		it('bloquea la IP tras 5 fallos y se libera despues', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			for (let i = 0; i < 5; i += 1) {
				service.issueChallenge({
					deviceId: 'desconocido',
					roomId: ROOM,
					socketId: SOCKET,
					limitKey: IP,
				});
			}
			expect(service.isLockedOut(IP)).toBe(true);
			// Incluso el dispositivo legitimo es rechazado desde esa IP.
			const { hello } = await authenticate(viewer);
			expect(hello).toEqual({ ok: false, reason: 'locked-out' });

			clock += 5 * 60_000 + 1;
			expect(service.isLockedOut(IP)).toBe(false);
			const after = await authenticate(viewer);
			expect(after.result).toMatchObject({ ok: true });
		});

		it('otra IP no se ve afectada', async () => {
			for (let i = 0; i < 5; i += 1) {
				service.issueChallenge({
					deviceId: 'x',
					roomId: ROOM,
					socketId: SOCKET,
					limitKey: IP,
				});
			}
			expect(service.isLockedOut('192.168.1.99')).toBe(false);
		});

		it('un exito limpia los fallos acumulados', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			for (let i = 0; i < 4; i += 1) {
				service.issueChallenge({
					deviceId: 'x',
					roomId: ROOM,
					socketId: SOCKET,
					limitKey: IP,
				});
			}
			await authenticate(viewer);
			service.issueChallenge({
				deviceId: 'x',
				roomId: ROOM,
				socketId: SOCKET,
				limitKey: IP,
			});
			expect(service.isLockedOut(IP)).toBe(false);
		});
	});

	describe('persistencia', () => {
		it('un servicio nuevo recupera los dispositivos y autentica', async () => {
			const viewer = await createViewer();
			await pair(viewer);
			service = newService();
			expect(service.list()).toHaveLength(1);
			const { result } = await authenticate(viewer);
			expect(result).toMatchObject({ ok: true });
		});

		it('descarta entradas con clave publica corrupta', () => {
			storage.saved = [
				{
					id: 'roto',
					name: 'x',
					publicKey: 'no-es-una-clave',
					createdAt: 0,
					lastSeenAt: 0,
					expiresAt: null,
				},
			];
			expect(newService().list()).toHaveLength(0);
		});
	});
});

describe('FileTrustedDevicesStorage', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-devices-'));
	});

	afterEach(() => {
		fs.removeSync(dir);
	});

	const sample: TrustedDevice = {
		id: 'a'.repeat(32),
		name: 'Celular',
		publicKey: Buffer.alloc(32, 1).toString('base64url'),
		createdAt: 1,
		lastSeenAt: 2,
		expiresAt: null,
	};

	it('guarda y recarga, creando el directorio si falta', () => {
		const storage = new FileTrustedDevicesStorage(
			path.join(dir, 'sub', 'trusted-devices.json'),
		);
		storage.save([sample]);
		expect(storage.load()).toEqual([sample]);
		expect(fs.existsSync(path.join(dir, 'sub', 'trusted-devices.json.tmp'))).toBe(
			false,
		);
	});

	it('devuelve lista vacia si el archivo no existe o esta corrupto', () => {
		const file = path.join(dir, 'trusted-devices.json');
		const storage = new FileTrustedDevicesStorage(file);
		expect(storage.load()).toEqual([]);
		fs.writeFileSync(file, '{no es json');
		expect(storage.load()).toEqual([]);
		fs.writeFileSync(file, '{"a":1}');
		expect(storage.load()).toEqual([]);
	});
});
