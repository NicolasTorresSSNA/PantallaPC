# Cambios respecto a Deskreen CE

Este documento cumple el aviso de modificación de la sección 5(a) de la AGPL-3.0.

- **Obra original:** [Deskreen CE](https://github.com/pavlobu/deskreen) **v3.2.16**,
  commit `b5dc3d4` (8 de julio de 2026), © Pavlo Buidenkov y colaboradores, AGPL-3.0.
- **Modificaciones:** Nicolas Torres, **23 y 24 de octubre de 2026**, con asistencia de
  Claude (Anthropic). Cada cambio es un commit de este repositorio posterior a `b5dc3d4`;
  `git log b5dc3d4..master` los lista y `git diff b5dc3d4 master` muestra el diff completo
  (67 archivos, sin contar los `package-lock.json`).
- No se modificó el texto de la licencia ([LICENSE](LICENSE)).

## 1. Dispositivos de confianza (emparejar una vez, reconectar sin diálogo)

El cambio principal. Diseño y modelo de seguridad en
[docs/dispositivos-de-confianza.md](docs/dispositivos-de-confianza.md).

| Archivo | Qué hace |
|---|---|
| `src/features/TrustedDevicesService/index.ts` | Lista de dispositivos de confianza, desafío de un solo uso, verificación Ed25519, límite de intentos, emparejamiento |
| `src/features/TrustedDevicesService/fileStorage.ts` | Persistencia atómica en `trusted-devices.json` (solo claves públicas) |
| `src/common/trustProtocol.ts` | Formato del mensaje firmado y del código comparable, compartido por servidor y visor |
| `src/server/trustedDeviceSocketHandlers.ts` | Eventos de socket `AUTH_HELLO`, `AUTH_RESPONSE`, `PAIR_REQUEST` |
| `src/server/darkwireSocket.ts`, `src/server/index.ts` | Registro de los manejadores; registro (sala enmascarada) de la señalización |
| `src/server/onDeviceConnectedCallback.ts` | Si el visor firmó el desafío de **esa** sala, se omite el diálogo "Permitir" |
| `src/client-viewer/src/features/TrustedDevice/*` | Visor: identidad Ed25519 en JavaScript puro (`@noble/curves`), almacenamiento en IndexedDB, apretón de manos |
| `src/client-viewer/src/features/PeerConnection/peerConnectionHandleSocket.ts` | Ejecuta el apretón de manos antes de entrar a la sala |
| `src/renderer/src/components/AllowConnectionForDeviceAlert.tsx`, `src/renderer/src/containers/DeskreenStepper.tsx` | Diálogo "Permitir" con el código y la casilla "Recordar este dispositivo"; avance automático |
| `src/common/Device.ts`, `src/common/IpcEvents.enum.ts`, `src/main/helpers/ipcMainHandlers.ts` | Campo `deviceSocketId` (lo estampa el servidor) y llamadas IPC nuevas |

El visor usa Ed25519 en JavaScript puro porque se sirve por HTTP en la red local, que no es
un contexto seguro y no expone `crypto.subtle`.

## 2. Elegir qué transmitir antes de conectar

- `src/features/SourcePreselection/index.ts`: selección persistente de pantalla/ventana,
  validada contra las fuentes disponibles antes de usarla.
- `src/renderer/src/components/StepsOfStepper/PreselectSourcePanel.tsx`, `ScanQRStep.tsx`:
  el panel en el paso del QR (dentro de *Opciones de conexión*).
- `src/renderer/src/containers/DeskreenStepper.tsx`: al aceptar un dispositivo, si hay una
  fuente válida, se empieza a transmitir sin los pasos "Seleccionar" y "Confirmar".
- `src/renderer/src/features/PeerConnection/CallSignalGate.ts`: **corrección** de una
  carrera del original que se hacía visible con lo anterior: la llamada WebRTC se perdía si
  se pedía antes de que existiera la oferta.

## 3. Dirección estable (mDNS)

- `src/features/DiscoveryService/*`, `src/main/helpers/discovery.ts`: anuncia
  `deskreen-<equipo>.local` y el servicio `_deskreen._tcp` con una sola IP (la de la red
  local) y vigila los cambios de IP. Opcional, **apagado por defecto**.
- Nueva dependencia: `bonjour-service`.

## 4. Robustez

- `src/features/SharingSessionService/*`: si la ventana auxiliar que "es dueña" de la sala
  desaparece, se limpia la sala y se crea una nueva (antes quedaba un QR muerto).
- El visor acota el tiempo del apretón de manos y muestra una línea de diagnóstico en el
  diálogo de error (`src/client-viewer/src/utils/diagnostics.ts`, sin datos sensibles).
- `src/features/PeerConnectionHelperRendererService/index.ts`: la ventana auxiliar WebRTC
  queda siempre oculta (`DESKREEN_SHOW_HELPER=1` para depurar).

## 5. Empaquetado y datos

- `src/main/portableData.ts`, `src/main/portableDataDir.ts`: carpeta de datos junto al
  ejecutable (`data/`), o `%APPDATA%\PantallaPC` si está instalada con el instalador; copia
  una sola vez los ajustes del Deskreen original si existen, sin pisar nada.
- `electron-builder.yml`: `appId` y nombre propios, destino Windows `dir` + instalador NSIS
  por usuario, sin firma de código, usa el Electron de `node_modules`.
- `scripts/publicar-app.ps1`: compila y actualiza una instalación local conservando `data/`.

## 6. Dependencias y seguridad

- **Electron 37 → 45**; `electron.vite.config.ts`: el *preload* ya no se compila a bytecode
  (el V8 del renderer rechazaba el caché con Electron 45). El proceso principal sigue en
  bytecode.
- `npm audit fix` y subidas puntuales (`vite`, `i18next-fs-backend`, entre otras): se
  eliminaron las vulnerabilidades críticas conocidas. Quedan avisos altos (p. ej.
  `node-forge`, sin arreglo disponible).
- Nuevas: `@noble/curves`, `@noble/hashes`, `bonjour-service`, `vitest`.

## 7. Interfaz

- `src/renderer/src/components/StepsOfStepper/IntermediateStep.tsx`, `assets/base.css`: el
  contenedor de cada paso tenía **altura fija**; ahora es mínima y la página se desplaza.
- Textos nuevos en `src/common/locales/{en,es}` y `src/client-viewer/public/locales/{en,es}`.

## 8. Eliminado o desactivado

- `src/main/utils/getNewVersionTag.ts`: la consulta de nuevas versiones al GitHub del
  original está desactivada (no hay conexión saliente).
- `.github/FUNDING.yml`, `.github/workflows/release.yml`, `.github/stale.yml`,
  `.github/config.yml`: pertenecen a la infraestructura del proyecto original.
  Las plantillas de issues se reescribieron.
- El README original pasó a `docs/UPSTREAM-README.md`.

## 9. Pruebas

`npm test` ejecuta **97 pruebas** (Vitest), que no existían en el original: criptografía y
protocolo de dispositivos de confianza (incluido el flujo completo visor ↔ servidor con
sockets en memoria), descubrimiento, preselección, autorreparación de salas, la compuerta de
señales de la llamada y la selección de carpeta de datos.

## Sin verificar

Probado en Windows 11 con Chrome en Android. **No** se probó en macOS ni Linux, ni con
iPhone/Safari, ni el modo "instalador por máquina" (Archivos de programa).
