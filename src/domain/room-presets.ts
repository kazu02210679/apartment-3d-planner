import { z } from 'zod'

export const TATAMI_AREA_SQUARE_METRES = 1.62 as const

export const ROOM_PRESET_IDS = ['6-tatami', '8-tatami', '10-tatami', '12-tatami'] as const

export const RoomPresetIdSchema = z.enum(ROOM_PRESET_IDS)
export type RoomPresetId = z.infer<typeof RoomPresetIdSchema>

export const ROOM_PRESETS = {
  '6-tatami': {
    id: '6-tatami',
    label: '6畳',
    tatamiCount: 6,
    areaSquareMetres: 9.72,
    width: 2700,
    depth: 3600,
    height: 2400,
  },
  '8-tatami': {
    id: '8-tatami',
    label: '8畳',
    tatamiCount: 8,
    areaSquareMetres: 12.96,
    width: 3600,
    depth: 3600,
    height: 2400,
  },
  '10-tatami': {
    id: '10-tatami',
    label: '10畳',
    tatamiCount: 10,
    areaSquareMetres: 16.2,
    width: 3600,
    depth: 4500,
    height: 2400,
  },
  '12-tatami': {
    id: '12-tatami',
    label: '12畳',
    tatamiCount: 12,
    areaSquareMetres: 19.44,
    width: 3600,
    depth: 5400,
    height: 2400,
  },
} as const satisfies Record<
  RoomPresetId,
  {
    id: RoomPresetId
    label: string
    tatamiCount: number
    areaSquareMetres: number
    width: number
    depth: number
    height: number
  }
>

export type RoomPreset = (typeof ROOM_PRESETS)[RoomPresetId]
export type RoomPresetInput = RoomPresetId | RoomPreset | number | string

const PRESET_ALIASES: Record<string, RoomPresetId> = {
  '6': '6-tatami',
  '6-tatami': '6-tatami',
  '6tatami': '6-tatami',
  six: '6-tatami',
  'six-tatami': '6-tatami',
  '8': '8-tatami',
  '8-tatami': '8-tatami',
  '8tatami': '8-tatami',
  eight: '8-tatami',
  'eight-tatami': '8-tatami',
  '10': '10-tatami',
  '10-tatami': '10-tatami',
  '10tatami': '10-tatami',
  ten: '10-tatami',
  'ten-tatami': '10-tatami',
  '12': '12-tatami',
  '12-tatami': '12-tatami',
  '12tatami': '12-tatami',
  twelve: '12-tatami',
  'twelve-tatami': '12-tatami',
}

export function resolveRoomPreset(input: RoomPresetInput = '6-tatami'): RoomPreset {
  const requestedId =
    typeof input === 'object' ? input.id : String(input).trim().toLowerCase()
  const presetId = PRESET_ALIASES[requestedId]

  if (!presetId) {
    throw new Error(`Unsupported room preset: ${String(requestedId)}`)
  }

  return ROOM_PRESETS[presetId]
}
