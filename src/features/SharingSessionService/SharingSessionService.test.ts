import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import SharingSessionService from './index';
import SharingSessionStatusEnum from './SharingSessionStatusEnum';
import RoomIDService from '../../server/RoomIDService';
import { ConnectedDevicesService } from '../ConnectedDevicesService';
import type RendererWebrtcHelpersService from '../PeerConnectionHelperRendererService';

// El codigo de produccion usa `import uuid from 'uuid'` (interop del bundler);
// en Vitest se sustituye por una version equivalente.
vi.mock('uuid', () => ({ default: { v4: () => crypto.randomUUID() } }));

/**
 * En modo test las sesiones no crean ventanas; aqui se simula que la ventana
 * auxiliar (la que "duena" la sala) desaparece llamando a onHelperGone, que es
 * lo que dispara el evento 'closed' / 'render-process-gone' en la app real.
 */
describe('SharingSessionService: ventana auxiliar desaparecida', () => {
	let service: SharingSessionService;
	let rooms: RoomIDService;
	let devices: ConnectedDevicesService;
	const previousRunMode = process.env.RUN_MODE;

	beforeEach(() => {
		process.env.RUN_MODE = 'test';
		rooms = new RoomIDService();
		devices = new ConnectedDevicesService();
		service = new SharingSessionService(
			rooms,
			devices,
			{} as unknown as RendererWebrtcHelpersService,
		);
		service.user = { username: 'u', id: 'i' };
	});

	afterEach(() => {
		process.env.RUN_MODE = previousRunMode;
	});

	it('cada sesion nueva queda vigilada', async () => {
		const session = await service.createNewSharingSession('');
		expect(session.onHelperGone).toBeTypeOf('function');
	});

	it('si la sala en espera se queda sin ventana, se libera y se crea una nueva', async () => {
		const old = await service.createWaitingForConnectionSharingSession();
		expect(rooms.isRoomIDTaken(old.roomID)).toBe(true);

		old.onHelperGone?.();

		expect(old.status).toBe(SharingSessionStatusEnum.DESTROYED);
		expect(rooms.isRoomIDTaken(old.roomID)).toBe(false);
		expect(service.sharingSessions.has(old.id)).toBe(false);
		expect(service.waitingForConnectionSharingSession).toBeNull();

		// La reposicion es asincrona (espera al usuario local, ~1 s).
		await new Promise((r) => setTimeout(r, 1300));
		const fresh = service.waitingForConnectionSharingSession;
		expect(fresh).not.toBeNull();
		expect(fresh?.id).not.toBe(old.id);
		expect(fresh?.roomID).not.toBe(old.roomID);
		expect(rooms.isRoomIDTaken(fresh!.roomID)).toBe(true);
	});

	it('es idempotente: avisar dos veces no duplica la limpieza', async () => {
		const old = await service.createWaitingForConnectionSharingSession();
		old.onHelperGone?.();
		old.onHelperGone?.();
		await new Promise((r) => setTimeout(r, 1300));
		expect(
			[...service.sharingSessions.values()].filter(
				(s) => s.status !== SharingSessionStatusEnum.DESTROYED,
			),
		).toHaveLength(1);
	});

	it('una sesion que no es la de espera no toca a la sala en espera', async () => {
		const waiting = await service.createWaitingForConnectionSharingSession();
		const other = await service.createNewSharingSession('');
		other.onHelperGone?.();
		expect(service.waitingForConnectionSharingSession).toBe(waiting);
		expect(rooms.isRoomIDTaken(waiting.roomID)).toBe(true);
		expect(rooms.isRoomIDTaken(other.roomID)).toBe(false);
	});

	it('si habia un visor conectado, libera su cupo', async () => {
		const session = await service.createNewSharingSession('');
		session.setDeviceID('dev-1');
		devices.addDevice({
			id: 'dev-1',
			sharingSessionID: session.id,
			deviceOS: '',
			deviceType: '',
			deviceIP: '',
			deviceBrowser: '',
			deviceScreenWidth: 0,
			deviceScreenHeight: 0,
			deviceRoomId: session.roomID,
		});
		expect(devices.isSlotAvailable()).toBe(false);

		session.onHelperGone?.();
		await new Promise((r) => setTimeout(r, 10));
		expect(devices.isSlotAvailable()).toBe(true);
	});
});
