/**
 * Coordina CUANDO se envian al visor las senales de la oferta WebRTC.
 *
 * La oferta se genera de forma asincrona (captura de pantalla + SimplePeer) y
 * la llamada puede pedirse antes o despues de que exista. Orden irrelevante:
 *  - llamada pedida antes de la oferta: se envia en cuanto llega la primera senal;
 *  - llamada pedida despues: se envian las senales ya acumuladas;
 *  - senales posteriores (ICE incremental): se reenvian de inmediato.
 *
 * Antes, `callPeer` solo enviaba lo acumulado en ese instante y se marcaba como
 * iniciada: si aun no habia oferta, la llamada se perdia y el visor esperaba
 * para siempre (ocurre al empezar a transmitir justo tras aceptar el dispositivo).
 */
export default class CallSignalGate {
	private signals: string[] = [];

	private callRequested = false;

	private callStarted = false;

	constructor(private readonly send: (signal: string) => void) {}

	isCallStarted(): boolean {
		return this.callStarted;
	}

	/** Llega una senal del par local. */
	onSignal(signal: string): void {
		if (this.callStarted) {
			this.send(signal);
			return;
		}
		this.signals.push(signal);
		this.flushIfReady();
	}

	/** El usuario/host pide iniciar la llamada. Idempotente. */
	requestCall(): void {
		if (this.callStarted) return;
		this.callRequested = true;
		this.flushIfReady();
	}

	/**
	 * Se recrea el par (nueva fuente): se descartan las senales viejas. Una
	 * llamada ya pedida pero aun no enviada se conserva; una ya iniciada se
	 * reinicia para poder volver a llamar con la oferta nueva.
	 */
	reset(): void {
		this.signals = [];
		this.callStarted = false;
	}

	private flushIfReady(): void {
		if (!this.callRequested || this.signals.length === 0) return;
		this.callStarted = true;
		this.callRequested = false;
		const pending = this.signals;
		this.signals = [];
		pending.forEach((signal) => this.send(signal));
	}
}
