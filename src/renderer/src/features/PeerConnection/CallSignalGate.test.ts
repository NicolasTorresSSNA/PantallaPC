import { describe, it, expect, beforeEach } from 'vitest';
import CallSignalGate from './CallSignalGate';

describe('CallSignalGate', () => {
	let sent: string[];
	let gate: CallSignalGate;

	beforeEach(() => {
		sent = [];
		gate = new CallSignalGate((s) => sent.push(s));
	});

	it('llamada despues de la oferta: envia lo acumulado', () => {
		gate.onSignal('offer');
		gate.onSignal('ice-1');
		expect(sent).toEqual([]);
		gate.requestCall();
		expect(sent).toEqual(['offer', 'ice-1']);
		expect(gate.isCallStarted()).toBe(true);
	});

	it('llamada ANTES de la oferta (el caso que fallaba): se envia al llegar la primera senal', () => {
		gate.requestCall();
		expect(sent).toEqual([]);
		expect(gate.isCallStarted()).toBe(false);
		gate.onSignal('offer');
		expect(sent).toEqual(['offer']);
		expect(gate.isCallStarted()).toBe(true);
	});

	it('senales posteriores a la llamada se reenvian de inmediato', () => {
		gate.requestCall();
		gate.onSignal('offer');
		gate.onSignal('ice-1');
		gate.onSignal('ice-2');
		expect(sent).toEqual(['offer', 'ice-1', 'ice-2']);
	});

	it('no hay llamada sin pedirla: las senales esperan', () => {
		gate.onSignal('offer');
		gate.onSignal('ice-1');
		expect(sent).toEqual([]);
		expect(gate.isCallStarted()).toBe(false);
	});

	it('pedir la llamada varias veces no duplica envios', () => {
		gate.onSignal('offer');
		gate.requestCall();
		gate.requestCall();
		gate.requestCall();
		expect(sent).toEqual(['offer']);
	});

	it('reset descarta senales viejas pero conserva una llamada aun no enviada', () => {
		gate.onSignal('oferta-vieja');
		gate.requestCall(); // se envia la vieja
		expect(sent).toEqual(['oferta-vieja']);

		const other: string[] = [];
		const g2 = new CallSignalGate((s) => other.push(s));
		g2.onSignal('oferta-vieja');
		g2.reset(); // se recrea el par antes de llamar
		g2.requestCall();
		g2.onSignal('oferta-nueva');
		expect(other).toEqual(['oferta-nueva']);
	});

	it('una llamada pedida y aun no enviada sobrevive al reset (par recreado)', () => {
		gate.requestCall();
		gate.reset();
		gate.onSignal('oferta-nueva');
		expect(sent).toEqual(['oferta-nueva']);
	});

	it('tras reset, una llamada ya iniciada puede volver a iniciarse', () => {
		gate.requestCall();
		gate.onSignal('offer-1');
		gate.reset();
		expect(gate.isCallStarted()).toBe(false);
		gate.requestCall();
		gate.onSignal('offer-2');
		expect(sent).toEqual(['offer-1', 'offer-2']);
	});

	it('el orden de las senales se conserva', () => {
		gate.onSignal('a');
		gate.onSignal('b');
		gate.requestCall();
		gate.onSignal('c');
		expect(sent).toEqual(['a', 'b', 'c']);
	});
});
