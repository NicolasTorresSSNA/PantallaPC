import path from 'path';
import fs from 'fs-extra';

/**
 * Perfil "portable": en la app empaquetada los datos (dispositivos de confianza,
 * ajustes, fuente elegida, cache) viven en una carpeta `data` junto al
 * ejecutable, en vez de dispersos por AppData o una carpeta temporal.
 * Puro (sin Electron) para poder probarlo.
 */

export const DATA_DIR_NAME = 'data';

/** Archivos de la version anterior (perfil por defecto) que se copian una vez. */
export const MIGRATABLE_FILES = [
	'deskreen-ce-storage.json',
	'trusted-devices.json',
] as const;

export const STANDARD_DIR_NAME = 'PantallaPC';
export const UNINSTALLER_NAME = 'Uninstall PantallaPC.exe';

export interface DataDirOptions {
	isPackaged: boolean;
	execPath: string;
	/**
	 * La app fue instalada con el instalador (hay desinstalador junto al .exe).
	 * Borrar la carpeta de instalacion borraria los datos, asi que se usa la
	 * carpeta estandar de Windows (%APPDATA%).
	 */
	hasUninstaller?: boolean;
	/** Se puede escribir junto al ejecutable (falso en Archivos de programa). */
	isExeDirWritable?: boolean;
	/** %APPDATA% (carpeta estandar de datos de usuario en Windows). */
	appDataDir?: string;
	/** Definida por el modo "portable" de electron-builder (carpeta del .exe real). */
	portableExecutableDir?: string;
	/** Forzar una carpeta concreta (pruebas, o quien quiera otro sitio). */
	overrideDir?: string;
}

/**
 * Carpeta de datos a usar, o null para dejar la de Electron por defecto
 * (solo desarrollo sin empaquetar). App instalada o carpeta sin permiso de
 * escritura: %APPDATA%\PantallaPC.
 */
export function resolveDataDir(opts: DataDirOptions): string | null {
	if (opts.overrideDir) return path.resolve(opts.overrideDir);
	if (!opts.isPackaged) return null;
	if (opts.hasUninstaller || opts.isExeDirWritable === false) {
		// Propia de PantallaPC: NO la de "deskreen-ce", que usa el Deskreen original.
		return opts.appDataDir
			? path.join(opts.appDataDir, STANDARD_DIR_NAME)
			: null;
	}
	const baseDir = opts.portableExecutableDir || path.dirname(opts.execPath);
	return path.join(baseDir, DATA_DIR_NAME);
}

/**
 * Primera ejecucion con carpeta vacia: copia los ajustes y dispositivos de
 * confianza del perfil anterior para no tener que volver a emparejar. Nunca
 * pisa archivos existentes ni toca el origen. Devuelve lo copiado.
 */
export function migrateLegacyFiles(
	legacyDir: string,
	targetDir: string,
): string[] {
	const copied: string[] = [];
	try {
		if (!fs.existsSync(legacyDir)) return copied;
		fs.ensureDirSync(targetDir);
		for (const name of MIGRATABLE_FILES) {
			const from = path.join(legacyDir, name);
			const to = path.join(targetDir, name);
			if (fs.existsSync(to) || !fs.existsSync(from)) continue;
			fs.copyFileSync(from, to);
			copied.push(name);
		}
	} catch (error) {
		console.error('portable data migration failed', error);
	}
	return copied;
}
