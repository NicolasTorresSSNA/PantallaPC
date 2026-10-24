import path from 'path';
import { app } from 'electron';
import { ConnectedDevicesService } from '../../features/ConnectedDevicesService';
import SharingSessionService from '../../features/SharingSessionService';
import RendererWebrtcHelpersService from '../../features/PeerConnectionHelperRendererService';
import RoomIDService from '../../server/RoomIDService';
import DesktopCapturerSources from '../../features/DesktopCapturerSourcesService';
import DesktopCapturerSourcesService from '../../features/DesktopCapturerSourcesService';
import type { DiscoveryService } from '../../features/DiscoveryService';
import { TrustedDevicesService } from '../../features/TrustedDevicesService';
import { FileTrustedDevicesStorage } from '../../features/TrustedDevicesService/fileStorage';

export interface DeskreenGlobal {
	appPath: string;
	rendererWebrtcHelpersService: RendererWebrtcHelpersService;
	roomIDService: RoomIDService;
	connectedDevicesService: ConnectedDevicesService;
	sharingSessionService: SharingSessionService;
	trustedDevicesService: TrustedDevicesService;
	discoveryService: DiscoveryService;
	desktopCapturerSourcesService: DesktopCapturerSourcesService;
	latestAppVersion: string;
	currentAppVersion: string;
	cliLocalIp?: string;
}

export const initGlobals = (appPath: string, cliLocalIp?: string) => {
	const deskreenGlobal: DeskreenGlobal = global as unknown as DeskreenGlobal;

	deskreenGlobal.appPath = appPath;
	deskreenGlobal.rendererWebrtcHelpersService =
		new RendererWebrtcHelpersService(appPath);
	deskreenGlobal.roomIDService = new RoomIDService();
	deskreenGlobal.connectedDevicesService = new ConnectedDevicesService();
	deskreenGlobal.sharingSessionService = new SharingSessionService(
		deskreenGlobal.roomIDService,
		deskreenGlobal.connectedDevicesService,
		deskreenGlobal.rendererWebrtcHelpersService,
	);
	deskreenGlobal.trustedDevicesService = new TrustedDevicesService(
		new FileTrustedDevicesStorage(
			path.join(app.getPath('userData'), 'trusted-devices.json'),
		),
	);
	deskreenGlobal.desktopCapturerSourcesService = new DesktopCapturerSources();
	deskreenGlobal.latestAppVersion = '';
	deskreenGlobal.currentAppVersion = app.getVersion();
	deskreenGlobal.cliLocalIp = cliLocalIp;
};
