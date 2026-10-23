import React from 'react';
import { Intent, Alert, H4, Checkbox } from '@blueprintjs/core';
import DeviceInfoCallout from './DeviceInfoCallout';
import { Device } from '../../../common/Device';
import { useTranslation } from 'react-i18next';

interface AllowConnectionForDeviceAlertProps {
	device: Device | null;
	isOpen: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	/** Presente solo si el visor pidio emparejarse (puede ser recordado). */
	pairing?: { code: string; name: string } | null;
	rememberDevice?: boolean;
	onRememberDeviceChange?: (remember: boolean) => void;
}

const AllowConnectionForDeviceAlert: React.FC<
	AllowConnectionForDeviceAlertProps
> = (props) => {
	const {
		device,
		isOpen,
		onCancel,
		onConfirm,
		pairing,
		rememberDevice = false,
		onRememberDeviceChange,
	} = props;
	const { t } = useTranslation();
	const denyText = t('deny');
	const allowText = t('allow');

	return (
		<Alert
			className="class-allow-device-to-connect-alert rounded-pill-alert"
			cancelButtonText={denyText}
			confirmButtonText={allowText}
			icon="feed"
			intent={Intent.DANGER}
			isOpen={isOpen}
			onCancel={onCancel}
			onConfirm={onConfirm}
			transitionDuration={0}
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			usePortal={false}
		>
			<H4>{t('someone-is-trying-to-connect-do-you-allow')}</H4>
			<DeviceInfoCallout
				deviceType={device?.deviceType}
				deviceIP={device?.deviceIP}
				deviceOS={device?.deviceOS}
				deviceBrowser={device?.deviceBrowser}
				deviceRoomId={device?.deviceRoomId}
			/>
			{pairing && (
				<div id="pairing-section" style={{ marginTop: '12px' }}>
					<div>{t('pairing-code-compare')}</div>
					<H4 style={{ letterSpacing: '4px' }}>{pairing.code}</H4>
					<Checkbox
						id="remember-device-checkbox"
						checked={rememberDevice}
						label={t('remember-this-device')}
						onChange={(e) =>
							onRememberDeviceChange?.((e.target as HTMLInputElement).checked)
						}
					/>
					<small>{t('remember-this-device-hint')}</small>
				</div>
			)}
		</Alert>
	);
};

export default AllowConnectionForDeviceAlert;
