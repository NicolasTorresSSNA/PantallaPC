import os from 'os';
import { app } from 'electron';
import { DiscoveryService } from '../../features/DiscoveryService';
import { BonjourPublisher } from '../../features/DiscoveryService/bonjourPublisher';
import { signalingServer } from '../../server';
import { store } from '../../common/deskreen-electron-store';
import { ElectronStoreKeys } from '../../common/ElectronStoreKeys.enum';
import { getDeskreenGlobal } from './getDeskreenGlobal';
import getMyLocalIpV4 from './getMyLocalIpV4';

export function isStableAddressEnabled(): boolean {
	return (
		store.has(ElectronStoreKeys.StableAddressEnabled) &&
		store.get(ElectronStoreKeys.StableAddressEnabled) === 'true'
	);
}

export function setStableAddressEnabled(enabled: boolean): boolean {
	store.set(ElectronStoreKeys.StableAddressEnabled, enabled ? 'true' : 'false');
	const { discoveryService } = getDeskreenGlobal();
	if (!enabled) {
		discoveryService.stop();
		return false;
	}
	return discoveryService.start();
}

/** Crea el servicio (sin anunciar nada todavia); se apaga al cerrar la app. */
export function createDiscoveryService(cliLocalIp?: string): void {
	getDeskreenGlobal().discoveryService = new DiscoveryService({
		publisher: new BonjourPublisher(),
		getOsHostname: () => os.hostname(),
		getLocalIp: () => cliLocalIp || getMyLocalIpV4() || undefined,
		getPort: () => signalingServer.port,
	});
	app.on('will-quit', () => getDeskreenGlobal().discoveryService.stop());
}

/** Anuncia solo si el usuario activo la direccion estable. */
export function startDiscoveryIfEnabled(): void {
	if (isStableAddressEnabled()) {
		getDeskreenGlobal().discoveryService.start();
	}
}
