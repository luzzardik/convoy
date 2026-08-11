// Imports
import { computed, type Ref } from 'vue';

// useErrorMap
export default function useErrorMap(formErrors: Ref<string[] | null>, errorMap: Record<string, string>, defaultField: string) {
	return computed(() => {
		// No errors
		if (!formErrors.value || !Array.isArray(formErrors.value)) return {};
		// Deal with errors
		const perfield: Record<string, string[]> = {};
		for (let error of formErrors.value) {
			// Split and read error (if path available?)
			const split = error.split(':');
			let field, code;
			if (split.length == 0) continue;
			else if (split.length == 2) {
				field = split[0] as string;
				code = split[1] as string;
			} else {
				code = split[0] as string;
				field = errorMap[code] || defaultField;
			}
			// Add to perfield
			if (!perfield[field]) perfield[field] = [];
			perfield[field]!.push(useErrorCode(code) || code);
		}
		// Cleanup
		for (let i in perfield) {
			if (perfield[i]!.length == 0) delete perfield[i];
		}
		// OK.
		return perfield;
	});
}
