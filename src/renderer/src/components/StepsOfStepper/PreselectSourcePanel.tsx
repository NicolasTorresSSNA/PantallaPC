import React, { useCallback, useEffect, useState } from 'react';
import { Button, ButtonGroup, Text } from '@blueprintjs/core';
import { useTranslation } from 'react-i18next';
import ChooseAppOrScreenOverlay from './ChooseAppOrScreenOverlay/ChooseAppOrScreenOverlay';
import SharingSourcePreviewCard from '../SharingSourcePreviewCard';
import { IpcEvents } from '../../../../common/IpcEvents.enum';

type PreselectedSource = { type: 'screen' | 'window'; id: string } | null;

/**
 * Permite elegir QUE transmitir antes de que se conecte un dispositivo. Si hay
 * una seleccion valida, al aceptar el dispositivo se empieza a transmitir sin
 * pasar por "Seleccionar" ni "Confirmar".
 */
const PreselectSourcePanel: React.FC = () => {
	const { t } = useTranslation();
	const [selected, setSelected] = useState<PreselectedSource>(null);
	const [isOverlayOpen, setIsOverlayOpen] = useState(false);
	const [isEntireScreen, setIsEntireScreen] = useState(true);
	const [isWayland, setIsWayland] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const { ipcRenderer } = window.electron;
		ipcRenderer
			.invoke(IpcEvents.GetPreselectedSource)
			.then((value: PreselectedSource) => {
				if (!cancelled) setSelected(value);
			})
			.catch(() => undefined);
		ipcRenderer
			.invoke(IpcEvents.GetIsLinuxWaylandSession)
			.then((value: boolean) => {
				if (!cancelled) setIsWayland(Boolean(value));
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	const open = useCallback((entireScreen: boolean) => {
		setIsEntireScreen(entireScreen);
		setIsOverlayOpen(true);
	}, []);

	// El overlay fija la fuente en la sesion en espera y luego llama a esto: se
	// lee de ahi el id elegido y se guarda como preseleccion persistente.
	const saveSelection = useCallback(async (type: 'screen' | 'window') => {
		const { ipcRenderer } = window.electron;
		const id = await ipcRenderer.invoke(
			IpcEvents.GetWaitingForConnectionSharingSessionSourceId,
		);
		if (typeof id === 'string' && id !== '') {
			const ok = await ipcRenderer.invoke(IpcEvents.SetPreselectedSource, {
				type,
				id,
			});
			if (ok) setSelected({ type, id });
		}
		setIsOverlayOpen(false);
	}, []);

	const clearSelection = useCallback(async () => {
		await window.electron.ipcRenderer.invoke(
			IpcEvents.SetPreselectedSource,
			null,
		);
		setSelected(null);
	}, []);

	// En Wayland la fuente se pide por el portal del sistema en cada conexion.
	if (isWayland) return null;

	return (
		<div
			id="preselect-source-panel"
			style={{ textAlign: 'center', marginBottom: '12px' }}
		>
			<Text>
				<strong>{t('share-on-connect-title')}</strong>
			</Text>
			<div>
				<Text className="bp3-text-muted">
					<small>{t('share-on-connect-hint')}</small>
				</Text>
			</div>
			{selected && (
				<div
					style={{ maxWidth: '220px', margin: '8px auto' }}
					id="preselected-source-preview"
				>
					<SharingSourcePreviewCard sharingSourceID={selected.id} />
				</div>
			)}
			<ButtonGroup>
				<Button icon="desktop" onClick={() => open(true)}>
					{t('entire-screen')}
				</Button>
				<Button icon="application" onClick={() => open(false)}>
					{t('application-window')}
				</Button>
				{selected && (
					<Button icon="cross" onClick={() => void clearSelection()}>
						{t('share-on-connect-clear')}
					</Button>
				)}
			</ButtonGroup>
			<ChooseAppOrScreenOverlay
				isEntireScreenToShareChosen={isEntireScreen}
				isChooseAppOrScreenOverlayOpen={isOverlayOpen}
				handleClose={() => setIsOverlayOpen(false)}
				handleNextEntireScreen={() => void saveSelection('screen')}
				handleNextApplicationWindow={() => void saveSelection('window')}
				isWaylandSession={false}
			/>
		</div>
	);
};

export default PreselectSourcePanel;
