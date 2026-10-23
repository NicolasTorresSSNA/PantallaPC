import {
	ErrorMessage,
	type ErrorMessageType,
} from '../../components/ErrorDialog/ErrorMessageEnum';

export default class PeerConnectionUIHandler {
	setMyDeviceDetails: (details: DeviceDetails) => void;

	hostAllowedToConnectCallback: () => void;

	setScreenSharingSourceTypeCallback: (s: ScreenSharingSourceType) => void;

	setAppLanguageCallback: (newLang: string) => void;

	setDialogErrorMessageCallback: (message: ErrorMessageType) => void;

	setIsErrorDialogOpen: (val: boolean) => void;

	setPairingCodeCallback: (code: string | null) => void;

	errorDialogMessage: ErrorMessageType = ErrorMessage.UNKNOWN_ERROR;

	constructor(
		setMyDeviceDetails: (details: DeviceDetails) => void,
		hostAllowedToConnectCallback: () => void,
		setScreenSharingSourceTypeCallback: (s: ScreenSharingSourceType) => void,
		setAppLanguageCallback: (newLang: string) => void,
		setDialogErrorMessageCallback: (message: ErrorMessageType) => void,
		setIsErrorDialogOpen: (val: boolean) => void,
		setPairingCodeCallback: (code: string | null) => void = () => {},
	) {
		this.hostAllowedToConnectCallback = hostAllowedToConnectCallback;
		this.setMyDeviceDetails = setMyDeviceDetails;
		this.setScreenSharingSourceTypeCallback =
			setScreenSharingSourceTypeCallback;
		this.setAppLanguageCallback = setAppLanguageCallback;
		this.setDialogErrorMessageCallback = setDialogErrorMessageCallback;
		this.setIsErrorDialogOpen = setIsErrorDialogOpen;
		this.setPairingCodeCallback = setPairingCodeCallback;
	}
}
