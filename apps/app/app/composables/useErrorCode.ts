export default function useErrorCode(code: string) {
	return (
		{
			convoy_code_required: 'Le code convoi est requis.',
			convoy_not_found: "Le convoi n'existe pas.",
		}[code.toLowerCase()] ?? 'Une erreur inattendue est survenue.'
	);
}
