# Dispositivos de confianza: diseño y modelo de seguridad

Objetivo: que un celular ya autorizado vuelva a ver la pantalla **sin que el usuario acepte
un diálogo en el PC**, sin debilitar la protección que ese diálogo daba.

## Por qué no basta con quitar el diálogo

En el original, el diálogo "Permitir" es la **única barrera real**: el código de sala tiene
6 dígitos, no hay límite de intentos y el canal es HTTP. Quitarlo sin más dejaría la
pantalla al alcance de cualquiera en la misma red. Por eso se sustituye por una credencial
criptográfica.

## Protocolo

```
Primera vez (requiere aprobación humana en el PC)
  visor  --PAIR_REQUEST {publicKey, name}-->  PC
  visor <--PAIR_PENDING {code, pairingNonce}-- PC       (ambos muestran el mismo código)
  [el usuario marca "Recordar" y pulsa "Permitir"]
  visor <--PAIR_CONFIRMED {deviceId}---------- PC       (el PC guarda la clave pública)

Siguientes veces
  visor  --AUTH_HELLO {deviceId}------------>  PC
  visor <--AUTH_CHALLENGE {id, nonce, exp}---- PC       (un solo uso, vence a los 30 s)
  visor  --AUTH_RESPONSE {id, firma}-------->  PC
  visor <--AUTH_RESULT {ok}------------------- PC       (si ok: se omite "Permitir")
```

- **Clave:** Ed25519. El visor la genera y la guarda en IndexedDB; el PC solo guarda la
  clave **pública**. El identificador del dispositivo es la huella (SHA-256, 32 hex) de esa
  clave: no lo elige el cliente.
- **Mensaje firmado** (`src/common/trustProtocol.ts`): `deskreen-trust-v1`, id del
  dispositivo, **id de sala**, id del desafío y nonce. La firma queda atada a la sala y al
  desafío, así que no sirve para otra sala ni se puede repetir.
- **Atado a la conexión:** solo el mismo socket que recibió el desafío puede responderlo, y
  la autenticación vale solo para esa sala y ese socket. El servidor estampa el id de socket
  en el dispositivo; el cliente no puede falsearlo.
- **Código comparable:** 6 dígitos derivados de SHA-256 de la clave pública y de un nonce.
- **Límite de intentos:** 5 fallos en un minuto desde una IP bloquean esa IP 5 minutos.
- **Vigencia:** 30 días por defecto; se puede revocar (`revoke`) y se corta la sesión activa.
- **Degradación segura:** ante cualquier fallo, tiempo agotado o falta de soporte, el visor
  sigue con el flujo original (con diálogo). El apretón de manos del visor tiene un tope
  total de unos 8 s.

## Por qué JavaScript puro en el visor

El visor se sirve por **HTTP** en la red local. Eso no es un *contexto seguro*, y allí el
navegador no expone `crypto.subtle`. Se usa `@noble/curves` (auditada) y `@noble/hashes`.
La verificación en el servidor usa `crypto` de Node (Ed25519 estándar), compatible.

## Limitaciones (conocidas y abiertas)

1. **Sin TLS.** El código de 6 dígitos solo frena a atacantes casuales: un atacante activo
   en la misma red podría interponerse durante el **emparejamiento** (puede generar claves
   hasta que el código coincida). La solución real es TLS con certificado fijado.
2. **Clave privada extraíble.** Al no haber WebCrypto, la clave privada del visor es
   legible por el JavaScript del propio sitio (mismo origen). Mejora prevista con HTTPS.
3. **Identidad por origen.** El almacenamiento del navegador es por dirección: si cambia la
   IP del PC, el celular debe emparejar de nuevo. Mitigación: reserva DHCP, o `.local`
   (no funciona en Chrome para Android).
4. **Sin interfaz de gestión.** Hay llamadas IPC para listar y revocar dispositivos
   (`get-trusted-devices`, `revoke-trusted-device`), pero aún no hay pantalla que las use.

## Dónde está el código

Servidor: `src/features/TrustedDevicesService`, `src/server/trustedDeviceSocketHandlers.ts`.
Visor: `src/client-viewer/src/features/TrustedDevice`. Pruebas, incluido el flujo completo
con el código real de ambos lados: `src/features/TrustedDevicesService/*.test.ts` y
`src/server/trustedDeviceFlow.test.ts`.
