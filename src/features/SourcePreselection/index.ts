/**
 * Fuente elegida de antemano ("que transmitir") para empezar a compartir sin
 * volver a seleccionar nada cuando un dispositivo se conecta.
 *
 * Es pura: el almacenamiento se inyecta. Se persisten tipo e id; el id de una
 * ventana cambia entre sesiones, por lo que se valida contra las fuentes
 * disponibles ANTES de usarlo (si ya no existe, el flujo normal sigue igual).
 */

export type PreselectedSourceType = 'screen' | 'window';

export interface PreselectedSource {
	type: PreselectedSourceType;
	id: string;
}

export interface PreselectionStorage {
	has(key: string): boolean;
	get(key: string): string | undefined;
	set(key: string, value: string): void;
	delete(key: string): void;
}

export interface AvailableSources {
	screens: string[];
	windows: string[];
}

export const TYPE_KEY = 'preselectedSourceType';
export const ID_KEY = 'preselectedSourceId';

const MAX_ID_LENGTH = 200;

export class SourcePreselection {
	constructor(private readonly storage: PreselectionStorage) {}

	get(): PreselectedSource | null {
		if (!this.storage.has(TYPE_KEY) || !this.storage.has(ID_KEY)) return null;
		const type = this.storage.get(TYPE_KEY);
		const id = this.storage.get(ID_KEY);
		if ((type !== 'screen' && type !== 'window') || typeof id !== 'string') {
			return null;
		}
		if (id === '' || id.length > MAX_ID_LENGTH) return null;
		return { type, id };
	}

	/** `null` borra la seleccion previa. Devuelve false si el valor es invalido. */
	set(source: PreselectedSource | null): boolean {
		if (source === null) {
			this.storage.delete(TYPE_KEY);
			this.storage.delete(ID_KEY);
			return true;
		}
		if (
			(source.type !== 'screen' && source.type !== 'window') ||
			typeof source.id !== 'string' ||
			source.id === '' ||
			source.id.length > MAX_ID_LENGTH
		) {
			return false;
		}
		this.storage.set(TYPE_KEY, source.type);
		this.storage.set(ID_KEY, source.id);
		return true;
	}

	/** El id a usar ahora, o null si no hay seleccion o la fuente ya no existe. */
	resolve(available: AvailableSources): string | null {
		const selected = this.get();
		if (!selected) return null;
		const candidates =
			selected.type === 'screen' ? available.screens : available.windows;
		return candidates.includes(selected.id) ? selected.id : null;
	}
}
