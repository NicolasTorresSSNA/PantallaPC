import { describe, it, expect, beforeEach } from 'vitest';
import {
	DiscoveryService,
	stableHostname,
	type MdnsPublisher,
	type PublishConfig,
} from './index';

class FakePublisher implements MdnsPublisher {
	published: PublishConfig[] = [];

	stops = 0;

	publish(config: PublishConfig) {
		this.published.push(config);
		return {
			stop: () => {
				this.stops += 1;
			},
		};
	}
}

describe('stableHostname', () => {
	it('normaliza el nombre del equipo a una etiqueta DNS valida', () => {
		expect(stableHostname('DESKTOP-ABC_123')).toBe(
			'deskreen-desktop-abc-123.local',
		);
		expect(stableHostname('Mi PC de Nico!!')).toBe('deskreen-mi-pc-de-nico.local');
	});

	it('usa "pc" si no queda ningun caracter valido', () => {
		expect(stableHostname('')).toBe('deskreen-pc.local');
		expect(stableHostname('ñññ')).toBe('deskreen-pc.local');
	});

	it('recorta nombres largos sin dejar guion final', () => {
		const host = stableHostname(`${'a'.repeat(39)}-${'b'.repeat(20)}`);
		const label = host.replace(/^deskreen-/, '').replace(/\.local$/, '');
		expect(label.length).toBeLessThanOrEqual(40);
		expect(label.endsWith('-')).toBe(false);
	});

	it('solo produce caracteres seguros para una URL', () => {
		expect(stableHostname('Ünï/c\\ode:ホスト')).toMatch(/^[a-z0-9.-]+$/);
	});
});

describe('DiscoveryService', () => {
	let publisher: FakePublisher;
	let ip: string | undefined;
	let port: number;
	let intervals: { fn: () => void; ms: number }[];
	let cleared: unknown[];
	let service: DiscoveryService;

	beforeEach(() => {
		publisher = new FakePublisher();
		ip = '192.168.1.20';
		port = 3131;
		intervals = [];
		cleared = [];
		service = new DiscoveryService({
			publisher,
			getOsHostname: () => 'NICO-PC',
			getLocalIp: () => ip,
			getPort: () => port,
			setInterval: (fn, ms) => {
				intervals.push({ fn, ms });
				return intervals.length;
			},
			clearInterval: (h) => {
				cleared.push(h);
			},
		});
	});

	it('anuncia host, puerto e IP unica', () => {
		expect(service.start()).toBe(true);
		expect(publisher.published).toEqual([
			{
				name: 'deskreen-nico-pc',
				type: 'deskreen',
				port: 3131,
				host: 'deskreen-nico-pc.local',
				ip: '192.168.1.20',
				txt: { v: '1', app: 'deskreen-ce' },
			},
		]);
		expect(service.isRunning()).toBe(true);
	});

	it('los metadatos publicos no incluyen sala, claves ni identificadores', () => {
		service.start();
		expect(Object.keys(publisher.published[0].txt).sort()).toEqual(['app', 'v']);
	});

	it('start es idempotente', () => {
		service.start();
		service.start();
		expect(publisher.published).toHaveLength(1);
		expect(intervals).toHaveLength(1);
	});

	it('sin IP de red no anuncia nada', () => {
		ip = undefined;
		expect(service.start()).toBe(false);
		expect(publisher.published).toHaveLength(0);
		expect(service.isRunning()).toBe(false);
	});

	describe('URL estable', () => {
		it('es null mientras no se anuncia', () => {
			expect(service.getStableUrl('123456')).toBeNull();
		});

		it('incluye el host .local, el puerto actual y la sala', () => {
			service.start();
			expect(service.getStableUrl('123456')).toBe(
				'http://deskreen-nico-pc.local:3131/123456',
			);
			port = 3132;
			expect(service.getStableUrl('123456')).toBe(
				'http://deskreen-nico-pc.local:3132/123456',
			);
		});

		it('es null sin sala', () => {
			service.start();
			expect(service.getStableUrl('')).toBeNull();
		});
	});

	describe('cambios de red', () => {
		it('re-anuncia cuando cambia la IP, deteniendo el anuncio viejo', () => {
			service.start();
			ip = '10.0.0.7';
			service.refresh();
			expect(publisher.stops).toBe(1);
			expect(publisher.published).toHaveLength(2);
			expect(publisher.published[1].ip).toBe('10.0.0.7');
			expect(publisher.published[1].host).toBe(publisher.published[0].host);
		});

		it('no hace nada si la IP no cambio', () => {
			service.start();
			service.refresh();
			expect(publisher.stops).toBe(0);
			expect(publisher.published).toHaveLength(1);
		});

		it('deja de anunciar al perder la red y puede reiniciar luego', () => {
			service.start();
			ip = undefined;
			service.refresh();
			expect(service.isRunning()).toBe(false);
			expect(publisher.stops).toBe(1);
			service.refresh(); // sin efecto
			expect(publisher.published).toHaveLength(1);
		});

		it('el vigilante revisa la IP cada 10 s', () => {
			service.start();
			expect(intervals[0].ms).toBe(10_000);
			ip = '172.16.0.9';
			intervals[0].fn();
			expect(publisher.published.at(-1)?.ip).toBe('172.16.0.9');
		});
	});

	describe('stop', () => {
		it('detiene el anuncio y el vigilante', () => {
			service.start();
			service.stop();
			expect(publisher.stops).toBe(1);
			expect(cleared).toHaveLength(1);
			expect(service.isRunning()).toBe(false);
			expect(service.getStableUrl('123456')).toBeNull();
		});

		it('es seguro llamarlo sin haber iniciado o dos veces', () => {
			service.stop();
			service.start();
			service.stop();
			service.stop();
			expect(publisher.stops).toBe(1);
		});

		it('se puede volver a iniciar', () => {
			service.start();
			service.stop();
			expect(service.start()).toBe(true);
			expect(publisher.published).toHaveLength(2);
		});
	});
});
