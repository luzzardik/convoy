type OSRMInstruction = { type: 'turn' | 'new name' | 'depart' | 'arrive' | 'merge' | 'ramp' | 'on ramp' | 'off ramp' | 'fork' | 'ned of road' | 'use lane' | 'continue' | 'roundabout' | 'rotary' | 'roundabout turn' | 'notification'; modifier: 'uturn' | 'sharp right' | 'right' | 'slight right' | 'straight' | 'slight left' | 'left' | 'sharp left'; name: string; distanceM: number };
import { ArrowLeftIcon, ArrowRightIcon, MapIcon, CarFrontIcon, PinIcon } from '@lucide/vue';
export default function useOSRMInstruction(instruction: ComputedRef<OSRMInstruction | null>, nextPointLabel: Ref<string | null>, distanceToNextM: Ref<number | null>) {
	return computed(() => {
		// Default to POI
		if (!instruction.value) {
			return {
				icon: CarFrontIcon,
				distance: distanceToNextM?.value ?? '',
				modifier: '',
				name: nextPointLabel?.value ?? 'Prochain point de passage',
			};
		}

		// Instruction
		switch (instruction.value?.type) {
			// TODO: finish implementation
			case 'turn':
				return {
					icon: (instruction.value.modifier || 'left').includes('left') ? ArrowLeftIcon : ArrowRightIcon,
					distance: 'Dans ' + formatDistance(instruction.value.distanceM),
					name: instruction.value.name,
					modifier: (instruction.value.modifier || 'left').includes('left') ? 'Tournez à gauche' : 'Tournez à droite',
				};
			default:
				return { icon: MapIcon, distance: 'Dans ' + formatDistance(instruction.value.distanceM), name: instruction.value.name, modifier: instruction.value.type };
		}
	});
}
