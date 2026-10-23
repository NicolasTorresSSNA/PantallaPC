import { IpcEvents } from '../common/IpcEvents.enum';
import { getDeskreenGlobal } from '../main/helpers/getDeskreenGlobal';
import { deskreenApp } from '../main';
import { Device } from '../common/Device';
import SharingSessionStatusEnum from '../features/SharingSessionService/SharingSessionStatusEnum';

export function onDeviceConnectedCallback(device: Device): void {
	const deskreenGlobal = getDeskreenGlobal();
	const { connectedDevicesService, sharingSessionService } = deskreenGlobal;
	if (!connectedDevicesService.isSlotAvailable()) {
		const waitingSession =
			sharingSessionService.waitingForConnectionSharingSession;
		waitingSession?.denyConnectionForPartner();
		waitingSession?.setStatus(SharingSessionStatusEnum.NOT_CONNECTED);
		sharingSessionService.waitingForConnectionSharingSession = null;
		connectedDevicesService.resetPendingConnectionDevice();
		return;
	}
	connectedDevicesService.setPendingConnectionDevice(device);

	// Visor ya emparejado que firmo el desafio de ESTA sala: sin dialogo.
	const { trustedDevicesService } = deskreenGlobal;
	if (
		device.deviceSocketId &&
		trustedDevicesService.isSocketAuthenticated(
			device.deviceSocketId,
			device.deviceRoomId,
		)
	) {
		const waitingSession =
			sharingSessionService.waitingForConnectionSharingSession;
		// El visor puede reenviar sus detalles: auto-permitir solo una vez por sesion.
		if (
			waitingSession && waitingSession.status !== SharingSessionStatusEnum.NOT_CONNECTED
		) {
			return;
		}
		waitingSession?.setStatus(SharingSessionStatusEnum.CONNECTED);
		deskreenApp.mainWindow?.webContents.send(
			IpcEvents.DeviceAutoAllowed,
			device,
		);
		return;
	}

	deskreenApp.mainWindow?.webContents.send(
		IpcEvents.SetPendingConnectionDevice,
		device,
	);
}
