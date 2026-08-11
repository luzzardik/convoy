import type { ConvoyStatus } from '@convoy/db';

const CONVOY_STATUSES: Record<ConvoyStatus, string> = {
	DRAFT: 'Brouillon',
	ACTIVE: 'Actif',
	ARCHIVED: 'Archivé',
	READY: 'Prêt',
};

export default function formatConvoyStatus(status: ConvoyStatus) {
	return CONVOY_STATUSES[status];
}
