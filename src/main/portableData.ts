/**
 * Debe importarse PRIMERO en el proceso principal: otros modulos leen
 * `app.getPath('userData')` al cargarse, asi que la carpeta de datos tiene que
 * fijarse antes de que se evaluen.
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import {
	UNINSTALLER_NAME,
	migrateLegacyFiles,
	resolveDataDir,
} from './portableDataDir';

function canWriteTo(dir: string): boolean {
	try {
		fs.accessSync(dir, fs.constants.W_OK);
		return true;
	} catch {
		return false;
	}
}

const exeDir = path.dirname(process.execPath);

const dataDir = resolveDataDir({
	isPackaged: app.isPackaged,
	execPath: process.execPath,
	hasUninstaller: fs.existsSync(path.join(exeDir, UNINSTALLER_NAME)),
	isExeDirWritable: canWriteTo(exeDir),
	appDataDir: app.getPath('appData'),
	portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
	overrideDir: process.env.DESKREEN_DATA_DIR,
});

// Perfil por defecto del Deskreen original: se copian ajustes y dispositivos una
// sola vez (sin pisar nada) para no tener que volver a configurar.
const legacyDir = path.join(app.getPath('appData'), 'deskreen-ce');

if (dataDir) {
	app.setPath('userData', dataDir);
	migrateLegacyFiles(legacyDir, dataDir);
}
