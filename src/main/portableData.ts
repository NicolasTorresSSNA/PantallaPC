/**
 * Debe importarse PRIMERO en el proceso principal: otros modulos leen
 * `app.getPath('userData')` al cargarse, asi que la carpeta de datos tiene que
 * fijarse antes de que se evaluen.
 */
import path from 'path';
import { app } from 'electron';
import { migrateLegacyFiles, resolveDataDir } from './portableDataDir';

const dataDir = resolveDataDir({
	isPackaged: app.isPackaged,
	execPath: process.execPath,
	portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
	overrideDir: process.env.DESKREEN_DATA_DIR,
});

if (dataDir) {
	// Antes de cambiar la ruta: el perfil por defecto de la version anterior.
	const legacyDir = path.join(app.getPath('appData'), 'deskreen-ce');
	app.setPath('userData', dataDir);
	migrateLegacyFiles(legacyDir, dataDir);
}
