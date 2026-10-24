import { describe, it, expect, beforeEach } from 'vitest';
import {
	SourcePreselection,
	type PreselectionStorage,
	TYPE_KEY,
	ID_KEY,
} from './index';

class MemoryStorage implements PreselectionStorage {
	data = new Map<string, string>();

	has(key: string) {
		return this.data.has(key);
	}

	get(key: string) {
		return this.data.get(key);
	}

	set(key: string, value: string) {
		this.data.set(key, value);
	}

	delete(key: string) {
		this.data.delete(key);
	}
}

describe('SourcePreselection', () => {
	let storage: MemoryStorage;
	let pre: SourcePreselection;
	const available = {
		screens: ['screen:0:0', 'screen:1:0'],
		windows: ['window:100:0', 'window:200:0'],
	};

	beforeEach(() => {
		storage = new MemoryStorage();
		pre = new SourcePreselection(storage);
	});

	it('sin seleccion no hay nada que resolver', () => {
		expect(pre.get()).toBeNull();
		expect(pre.resolve(available)).toBeNull();
	});

	it('guarda y devuelve una pantalla', () => {
		expect(pre.set({ type: 'screen', id: 'screen:1:0' })).toBe(true);
		expect(pre.get()).toEqual({ type: 'screen', id: 'screen:1:0' });
		expect(pre.resolve(available)).toBe('screen:1:0');
	});

	it('guarda y resuelve una ventana existente', () => {
		pre.set({ type: 'window', id: 'window:200:0' });
		expect(pre.resolve(available)).toBe('window:200:0');
	});

	it('una ventana que ya no existe no se resuelve (flujo normal)', () => {
		pre.set({ type: 'window', id: 'window:999:0' });
		expect(pre.get()).not.toBeNull();
		expect(pre.resolve(available)).toBeNull();
	});

	it('una pantalla desconectada no se resuelve', () => {
		pre.set({ type: 'screen', id: 'screen:1:0' });
		expect(pre.resolve({ screens: ['screen:0:0'], windows: [] })).toBeNull();
	});

	it('el tipo importa: un id de pantalla no cuenta como ventana', () => {
		pre.set({ type: 'window', id: 'screen:0:0' });
		expect(pre.resolve(available)).toBeNull();
	});

	it('null borra la seleccion', () => {
		pre.set({ type: 'screen', id: 'screen:0:0' });
		expect(pre.set(null)).toBe(true);
		expect(pre.get()).toBeNull();
		expect(storage.data.size).toBe(0);
	});

	it('rechaza valores invalidos y no modifica lo guardado', () => {
		pre.set({ type: 'screen', id: 'screen:0:0' });
		expect(pre.set({ type: 'screen', id: '' })).toBe(false);
		expect(pre.set({ type: 'monitor' as never, id: 'x' })).toBe(false);
		expect(pre.set({ type: 'screen', id: 'a'.repeat(500) })).toBe(false);
		expect(pre.get()).toEqual({ type: 'screen', id: 'screen:0:0' });
	});

	it('ignora datos guardados corruptos', () => {
		storage.set(TYPE_KEY, 'otra-cosa');
		storage.set(ID_KEY, 'screen:0:0');
		expect(pre.get()).toBeNull();
		storage.set(TYPE_KEY, 'screen');
		storage.delete(ID_KEY);
		expect(pre.get()).toBeNull();
	});

	it('persiste entre instancias (reinicio de la app)', () => {
		pre.set({ type: 'screen', id: 'screen:1:0' });
		const reopened = new SourcePreselection(storage);
		expect(reopened.resolve(available)).toBe('screen:1:0');
	});
});
