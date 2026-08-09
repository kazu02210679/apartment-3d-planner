import { ScreenPlaceholder, type ScreenPlaceholderMode } from '../ScreenPlaceholder'
import {
  BoxPart,
  BoundsOutline,
  ModelBoundsProvider,
  type ModelProps,
} from './ModelPrimitives'

export function Monitor({
  dimensions,
  material,
  outlineColor,
  mode = 'workstation',
}: ModelProps & { readonly mode?: ScreenPlaceholderMode }) {
  const [width, height, depth] = dimensions
  const bezel = Math.min(0.035, depth * 0.28, width * 0.07)
  const panelHeight = height * 0.7
  const panelY = height / 2 - panelHeight / 2
  const front = depth / 2 - bezel / 2
  return (
    <group name="detailed-monitor">
      <ModelBoundsProvider dimensions={dimensions}>
        <BoxPart
          size={[width, panelHeight, bezel]}
          position={[0, panelY, front]}
          material={material}
          color="#101722"
        />
        <ScreenPlaceholder
          width={width * 0.9}
          height={panelHeight * 0.82}
          position={[0, panelY, depth / 2 - 0.004]}
          mode={mode}
        />
        <BoxPart
          size={[
            Math.min(0.055, width * 0.12),
            Math.max(0.04, height * 0.24),
            Math.min(0.05, depth * 0.35),
          ]}
          position={[0, -height * 0.22, 0]}
          material={material}
          color="#2a3545"
        />
        <BoxPart
          size={[width * 0.42, Math.min(0.04, height * 0.1), depth * 0.72]}
          position={[0, -height / 2 + Math.min(0.02, height * 0.05), 0]}
          material={material}
          color="#2a3545"
        />
        <BoundsOutline dimensions={dimensions} outlineColor={outlineColor} />
      </ModelBoundsProvider>
    </group>
  )
}
