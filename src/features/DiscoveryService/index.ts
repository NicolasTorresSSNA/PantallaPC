/**
 * Descubrimiento y direccion estable en la red local (mDNS).
 *
 * Anuncia al desktop como `deskreen-<equipo>.local` para que el visor del
 * celular se abra siempre en el MISMO origen aunque la IP del PC cambie; el
 * almacenamiento del navegador (y con el la identidad de confianza) es por
 * origen. Tambien publica el servicio `_deskreen._tcp` para una futura app
 * nativa que busque el PC sin escanear el QR.
 *
 * Es pura (sin red ni Electron): el publicador y el reloj se inyectan.
 */

export const SERVICE_TYPE = 'deskreen';
const MAX_LABEL_LENGTH = 40;
const IP_WATCH_INTERVAL_MS = 10_000;

export interface PublishConfig {
	name: string;
	type: string;
	port: number;
	/** Nombre mDNS completo (termina en .local). */
	host: string;
	/** Unica direccion IPv4 que se anuncia para `host`. */
	ip: string;
	/** Metadatos publicos: NUNCA incluir el id de sala ni claves. */
	txt: Record<string, string>;
}

export interface PublishedService {
	stop(): void;
}

export interface MdnsPublisher {
	publish(config: PublishConfig): PublishedService;
}

export interface DiscoveryDeps {
	publisher: MdnsPublisher;
	getOsHostname: () => string;
	getLocalIp: () => string | undefined;
	getPort: () => number;
	/** Inyectables para probar el vigilante de IP. */
	setInterval?: (fn: () => void, ms: number) => unknown;
	clearInterval?: (handle: unknown) => void;
}

/** `DESKTOP-ABC_123` -> `deskreen-desktop-abc-123.local` */
export function stableHostname(osHostname: string): string {
	const label = osHostname
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_LABEL_LENGTH)
		.replace(/-+$/g, '');
	return `deskreen-${label || 'pc'}.local`;
}

export class DiscoveryService {
	private running: { service: PublishedService; ip: string } | null = null;

	private watcher: unknown = null;

	constructor(private readonly deps: DiscoveryDeps) {}

	getStableHostname(): string {
		return stableHostname(this.deps.getOsHostname());
	}

	isRunning(): boolean {
		return this.running !== null;
	}

	/** URL estable de una sala, o null si el anuncio no esta activo. */
	getStableUrl(roomId: string): string | null {
		if (!this.running || !roomId) return null;
		return `http://${this.getStableHostname()}:${this.deps.getPort()}/${roomId}`;
	}

	/** Devuelve false si no hay IP de red local que anunciar. */
	start(): boolean {
		if (this.running) return true;
		const ip = this.deps.getLocalIp();
		if (!ip) return false;
		this.publishWith(ip);

		const setIntervalFn = this.deps.setInterval ?? setInterval;
		this.watcher = setIntervalFn(() => this.refresh(), IP_WATCH_INTERVAL_MS);
		// No mantener vivo el proceso solo por el vigilante.
		(this.watcher as { unref?: () => void } | null)?.unref?.();
		return true;
	}

	stop(): void {
		if (this.watcher !== null) {
			(this.deps.clearInterval ?? clearInterval)(
				this.watcher as Parameters<typeof clearInterval>[0],
			);
			this.watcher = null;
		}
		this.running?.service.stop();
		this.running = null;
	}

	/** Re-anuncia si la IP de la red cambio (DHCP, cambio de Wi-Fi). */
	refresh(): void {
		if (!this.running) return;
		const ip = this.deps.getLocalIp();
		if (!ip) {
			// Sin red: dejar de anunciar una IP que ya no existe.
			this.running.service.stop();
			this.running = null;
			return;
		}
		if (ip === this.running.ip) return;
		this.running.service.stop();
		this.publishWith(ip);
	}

	private publishWith(ip: string): void {
		const host = this.getStableHostname();
		const service = this.deps.publisher.publish({
			name: host.replace(/\.local$/, ''),
			type: SERVICE_TYPE,
			port: this.deps.getPort(),
			host,
			ip,
			txt: { v: '1', app: 'deskreen-ce' },
		});
		this.running = { service, ip };
	}
}
