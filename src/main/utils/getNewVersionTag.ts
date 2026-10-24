import axios from 'axios';

const githubApiRepoLatestReleaseUrl =
	'https://api.github.com/repos/pavlobu/deskreen/releases/latest';

/**
 * PantallaPC es un fork con sus propias versiones: consultar las releases del
 * Deskreen original ofreceria "actualizar" a una app distinta. Desactivado, y
 * sin ninguna conexion saliente.
 */
const UPDATE_CHECK_ENABLED = false;

export default async function getNewVersionTag(): Promise<string> {
	if (!UPDATE_CHECK_ENABLED) return '';
	try {
		const response = await axios({
			url: githubApiRepoLatestReleaseUrl,
			method: 'get',
			headers: { 'User-Agent': 'node.js' },
		});

		const tagName = response.data?.tag_name;
		if (typeof tagName !== 'string' || tagName.length === 0) {
			return '';
		}

		return tagName.startsWith('v') ? tagName.slice(1) : tagName;
	} catch (error) {
		console.error('Failed to fetch latest Deskreen release tag', error);
		return '';
	}
}
