# PantallaPC

[English](README.en.md) · **Español**

Transmite la pantalla de tu PC con Windows a cualquier navegador (por ejemplo, el de tu
celular) por la red local, **sin volver a aceptar permisos cada vez**: emparejas el
dispositivo una vez y después se reconecta solo.

> ### ⚠️ Fork modificado de Deskreen CE
>
> PantallaPC es un **trabajo derivado de [Deskreen CE](https://github.com/pavlobu/deskreen)
> v3.2.16** (© Pavlo Buidenkov y colaboradores, licencia **AGPL-3.0**). Esta versión fue
> **modificada por Nicolas Torres entre el 23 y el 24 de octubre de 2026**. La lista
> completa y fechada de lo que cambió está en [CHANGES.md](CHANGES.md).
>
> Es un proyecto personal, publicado por si a alguien le sirven los cambios. **No está
> afiliado, respaldado ni mantenido por Deskreen ni por deskreen.com.** El README original
> se conserva en [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md). Los commits que
> vienen del proyecto original conservan su autoría y hash.

## Qué cambia respecto a Deskreen CE

| | Deskreen CE (original) | PantallaPC |
|---|---|---|
| Conectar un dispositivo | QR + diálogo "Permitir" **en cada conexión** | Se empareja **una vez**; después reconecta sin diálogo |
| Qué transmitir | Se elige después de conectar | Se puede **elegir antes**; al aceptar el dispositivo empieza solo |
| Dirección | Cambia con la IP del PC | Opcional: `deskreen-<equipo>.local` (mDNS) |
| Sala sin dueño | El QR quedaba muerto en silencio | Se detecta y se crea una sala nueva |
| Perfil de datos | AppData | Junto al ejecutable (`data/`) o en `%APPDATA%\PantallaPC` si se instala |
| Actualizaciones | Consulta las releases del original | Desactivado (sin conexión saliente) |
| Electron | 37 | 45 (corrige vulnerabilidades conocidas) |

Detalle técnico y archivos tocados: [CHANGES.md](CHANGES.md). Diseño y modelo de
seguridad de los dispositivos de confianza: [docs/dispositivos-de-confianza.md](docs/dispositivos-de-confianza.md).

## Uso

Hay dos formas de tener la app (ambas se generan desde este código, ver [Compilar](#compilar)):

- **Instalador** (`PantallaPC-Setup-<versión>.exe`): instala para tu usuario, sin
  administrador, y crea accesos directos. Los datos quedan en `%APPDATA%\PantallaPC`,
  así sobreviven a desinstalar y actualizar.
- **Carpeta** (`PantallaPC.exe` dentro de una carpeta): portable. Los datos quedan en la
  subcarpeta `data/` junto al ejecutable; puedes copiar o mover la carpeta completa.

Primera conexión:

1. Abre PantallaPC. Si Windows pregunta por el firewall, permite **redes privadas**.
2. En tu celular (misma Wi-Fi) escanea el QR o escribe la dirección que aparece.
3. En el PC verás "Alguien está intentando conectarse" con un **código de 6 dígitos**.
   Debe coincidir con el que muestra el celular.
4. Marca **"Recordar este dispositivo"** y pulsa **Permitir**.

Desde entonces, ese celular entra sin diálogo. Puedes elegir **antes** qué transmitir en
*Opciones de conexión → Qué transmitir al conectar un dispositivo*; si no eliges nada,
todo funciona como en el original (eliges la fuente tras conectar).

### Dirección estable `.local` (opcional)

El navegador guarda la identidad del celular **por dirección**. Si la IP de tu PC cambia
(DHCP), el celular tendría que emparejarse otra vez. Activando
*Opciones de conexión → Usar dirección estable (.local)* la app se anuncia como
`deskreen-<nombre-del-equipo>.local` y esa dirección no cambia.

**Limitación importante:** Chrome en **Android no resuelve nombres `.local`**
(`ERR_NAME_NOT_RESOLVED`); en iPhone suele funcionar. Si te pasa, apágalo y, en su lugar,
reserva una IP fija para el PC en tu router (reserva DHCP).

## Seguridad y privacidad

- **El tráfico no está cifrado a nivel de transporte** (HTTP en tu red local, como en el
  original). El video viaja por WebRTC. Úsalo solo en redes en las que confíes.
- El emparejamiento exige tu aprobación en el PC. Después, el celular demuestra quién es
  **firmando un desafío de un solo uso** (Ed25519), atado a su conexión y a la sala; no hay
  contraseña que se pueda reutilizar. Tras 5 intentos fallidos en un minuto desde una IP, esa
  IP queda bloqueada 5 minutos. Los dispositivos vencen a los 30 días y puedes revocarlos.
- **Limitación conocida:** el código de 6 dígitos **no protege** de un atacante activo en tu
  misma red que se interponga durante el emparejamiento (para eso haría falta TLS con
  certificado fijado, aún no implementado). Empareja solo en redes de confianza.
- Lo que se guarda: `trusted-devices.json` (nombre y **clave pública** de cada dispositivo,
  nunca claves privadas) y `deskreen-ce-storage.json` (ajustes). La clave privada del
  celular queda en el almacenamiento de su navegador.
- **Sin telemetría propia.** El visor hereda un aviso de "analíticas de Google"; en las
  compilaciones de este repositorio **no hay etiqueta de Google Analytics configurada**, así
  que no se carga ninguna, aunque el aviso aparezca (elige *Deny* si quieres). La consulta
  de nuevas versiones al GitHub del original está desactivada.
- Puertos: TCP **3131** (visor y señalización; 3132 de respaldo) y, solo si activas
  `.local`, UDP **5353** (mDNS).

## Estado y límites

- Probado en **Windows 11** con **Chrome en Android**. macOS y Linux no se han probado en
  este fork (el código base original los soporta; los cambios nuevos no se verificaron allí).
- El ejecutable y el instalador **no están firmados**: SmartScreen puede advertirte.
- El descubrimiento "abro una app y encuentra el PC sin QR" requeriría una app nativa; aquí
  solo se publica el anuncio mDNS `_deskreen._tcp`, sin consumidor todavía.
- Algunas advertencias de `npm audit` persisten (p. ej. `node-forge` sin arreglo disponible).

## Compilar

Requisitos: **Node.js ≥ 23** (se usó 24) y npm ≥ 10. Probado en Windows.

```bash
npm install
cd src/client-viewer && npm install && cd ../..
npm run dev          # desarrollo
npm test             # 97 pruebas (Vitest)
npm run typecheck
```

Si Electron no descargó su binario durante `npm install`: `node node_modules/electron/install.js`.

Generar el ejecutable y el instalador (sin firma de código):

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build
npx electron-builder --win dir nsis --config electron-builder.yml
```

Salida en `dist/`: la carpeta `win-unpacked/` (con `PantallaPC.exe`) y
`PantallaPC-Setup-<versión>.exe`. El script `scripts/publicar-app.ps1` compila y actualiza
una carpeta instalada conservando su `data/`.

## Licencia y créditos

Distribuido bajo **GNU AGPL v3** (ver [LICENSE](LICENSE)), igual que el proyecto original.
Si ejecutas una versión modificada para que otras personas la usen a través de una red,
la AGPL te obliga a ofrecerles el código fuente correspondiente.

- **Deskreen CE** — © Pavlo Buidenkov y colaboradores — https://github.com/pavlobu/deskreen
- **Modificaciones de PantallaPC** — Nicolas Torres, 2026 (asistidas por Claude, de Anthropic;
  los commits lo indican en su pie).
- Dependencias nuevas: [`@noble/curves`](https://github.com/paulmillr/noble-curves) y
  [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) (MIT),
  [`bonjour-service`](https://github.com/onlxltd/bonjour-service) (MIT) y
  [`vitest`](https://vitest.dev) (MIT).
