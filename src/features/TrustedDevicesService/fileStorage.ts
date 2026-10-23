import fs from 'fs-extra';
import path from 'path';
import type { TrustedDevice, TrustedDevicesStorage } from './index';

/**
 * Guarda la lista en un JSON dentro de userData. Solo contiene claves
 * publicas, asi que no se cifra; la escritura es atomica (tmp + rename).
 */
export class FileTrustedDevicesStorage implements TrustedDevicesStorage {
	constructor(private readonly filePath: string) {}

	load(): TrustedDevice[] {
		try {
			const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	save(devices: TrustedDevice[]): void {
		fs.ensureDirSync(path.dirname(this.filePath));
		const tmp = `${this.filePath}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(devices, null, 2), 'utf8');
		fs.renameSync(tmp, this.filePath);
	}
}
