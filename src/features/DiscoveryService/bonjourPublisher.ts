import { Bonjour } from 'bonjour-service';
import type { MdnsPublisher, PublishConfig, PublishedService } from './index';

/**
 * Publicador mDNS real. bonjour-service anuncia por defecto TODAS las IP del
 * equipo (Docker, VirtualBox, ...), y un cliente podria resolver el nombre a
 * una que no alcanza; aqui se restringe a la IP de la red local elegida.
 */
export class BonjourPublisher implements MdnsPublisher {
	publish(config: PublishConfig): PublishedService {
		const bonjour = new Bonjour();
		const service = bonjour.publish({
			name: config.name,
			type: config.type,
			protocol: 'tcp',
			port: config.port,
			host: config.host,
			txt: config.txt,
			disableIPv6: true,
		});

		const originalRecords = service.records.bind(service);
		service.records = () =>
			originalRecords().filter(
				(record) =>
					(record.type !== 'A' && record.type !== 'AAAA') ||
					(record.type === 'A' && record.data === config.ip),
			);

		return {
			stop: () => {
				bonjour.unpublishAll(() => bonjour.destroy());
			},
		};
	}
}
