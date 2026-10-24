import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import {
	resolveDataDir,
	migrateLegacyFiles,
	MIGRATABLE_FILES,
} from './portableDataDir';

describe('resolveDataDir', () => {
	const execPath = path.join('D:', 'Apps', 'PantallaPC', 'PantallaPC.exe');

	it('empaquetada: carpeta "data" junto al ejecutable', () => {
		expect(resolveDataDir({ isPackaged: true, execPath })).toBe(
			path.join('D:', 'Apps', 'PantallaPC', 'data'),
		);
	});

	it('en modo portable usa la carpeta del .exe real, no la de extraccion temporal', () => {
		expect(
			resolveDataDir({
				isPackaged: true,
				execPath: path.join('C:', 'Temp', 'x', 'PantallaPC.exe'),
				portableExecutableDir: path.join('D:', 'Apps'),
			}),
		).toBe(path.join('D:', 'Apps', 'data'));
	});

	it('sin empaquetar (desarrollo) no cambia nada', () => {
		expect(resolveDataDir({ isPackaged: false, execPath })).toBeNull();
	});

	it('la carpeta forzada tiene prioridad, incluso sin empaquetar', () => {
		const dir = path.join(os.tmpdir(), 'mi-perfil');
		expect(
			resolveDataDir({ isPackaged: false, execPath, overrideDir: dir }),
		).toBe(path.resolve(dir));
		expect(
			resolveDataDir({ isPackaged: true, execPath, overrideDir: dir }),
		).toBe(path.resolve(dir));
	});
});

describe('migrateLegacyFiles', () => {
	let root: string;
	let legacy: string;
	let target: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-'));
		legacy = path.join(root, 'legacy');
		target = path.join(root, 'app', 'data');
	});

	afterEach(() => {
		fs.removeSync(root);
	});

	it('copia ajustes y dispositivos de confianza al perfil nuevo', () => {
		fs.ensureDirSync(legacy);
		fs.writeFileSync(
			path.join(legacy, 'deskreen-ce-storage.json'),
			'{"a":"1"}',
		);
		fs.writeFileSync(path.join(legacy, 'trusted-devices.json'), '[{"id":"x"}]');

		const copied = migrateLegacyFiles(legacy, target);

		expect(copied.sort()).toEqual([...MIGRATABLE_FILES].sort());
		expect(
			fs.readFileSync(path.join(target, 'trusted-devices.json'), 'utf8'),
		).toBe('[{"id":"x"}]');
	});

	it('no pisa archivos que ya existen en el perfil nuevo', () => {
		fs.ensureDirSync(legacy);
		fs.ensureDirSync(target);
		fs.writeFileSync(
			path.join(legacy, 'trusted-devices.json'),
			'[{"viejo":1}]',
		);
		fs.writeFileSync(
			path.join(target, 'trusted-devices.json'),
			'[{"nuevo":1}]',
		);

		expect(migrateLegacyFiles(legacy, target)).toEqual([]);
		expect(
			fs.readFileSync(path.join(target, 'trusted-devices.json'), 'utf8'),
		).toBe('[{"nuevo":1}]');
	});

	it('no modifica ni borra el perfil de origen', () => {
		fs.ensureDirSync(legacy);
		fs.writeFileSync(path.join(legacy, 'deskreen-ce-storage.json'), '{}');
		migrateLegacyFiles(legacy, target);
		expect(fs.existsSync(path.join(legacy, 'deskreen-ce-storage.json'))).toBe(
			true,
		);
	});

	it('solo copia archivos de la lista (no la cache ni otros datos)', () => {
		fs.ensureDirSync(legacy);
		fs.writeFileSync(path.join(legacy, 'Preferences'), 'x');
		fs.writeFileSync(path.join(legacy, 'trusted-devices.json'), '[]');
		migrateLegacyFiles(legacy, target);
		expect(fs.existsSync(path.join(target, 'Preferences'))).toBe(false);
	});

	it('sin perfil anterior no hace nada ni crea carpetas', () => {
		expect(migrateLegacyFiles(path.join(root, 'no-existe'), target)).toEqual(
			[],
		);
		expect(fs.existsSync(target)).toBe(false);
	});
});
