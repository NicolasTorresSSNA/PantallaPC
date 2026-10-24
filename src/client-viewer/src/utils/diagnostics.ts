/**
 * Bitacora corta de las etapas de conexion, solo para mostrar en el dialogo de
 * error y poder saber en que paso se quedo el visor. No guarda datos sensibles
 * (ni claves, ni codigos, ni el id de sala).
 */
const MAX_ENTRIES = 14;
const startedAt = Date.now();
const entries: string[] = [];

export function diag(stage: string): void {
	entries.push(`${((Date.now() - startedAt) / 1000).toFixed(1)}s ${stage}`);
	if (entries.length > MAX_ENTRIES) entries.shift();
}

export function getDiag(): string {
	return entries.join(' > ');
}
