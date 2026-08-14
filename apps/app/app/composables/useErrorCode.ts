export default function useErrorCode(code: string) {
	return (
		{
			convoy_code_required: 'Le code convoi est requis.',
			convoy_not_found: "Le convoi n'existe pas.",
			admin_password_required: 'Le mot de passe est requis.',
			invalid_credentials: 'Mot de passe incorrect.',
			server_not_ready: "Le serveur n'est pas prêt ou présente une erreur de configuration.",
			unexpected_issue: 'Une erreur inattendue est survenue.',
			convoy_unavailable: 'Vous ne pouvez pas rejoindre ce convoi.',
		}[code.toLowerCase()] ?? `Une erreur inattendue est survenue. (${code})`
	);
}
