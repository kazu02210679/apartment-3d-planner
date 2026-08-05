import { calculateSixteenByNinePanelDimensions } from '../dimensions'
import type {
  CatalogDefinition,
  CatalogPortDefinition,
  DimensionPolicy,
  LocalizedText,
} from '../types'

const label = (en: string, ja: string): LocalizedText => ({ en, ja })
const empty = {} as const
const fixed = { mode: 'fixed', axes: {} } as const
const free = { mode: 'free', axes: {} } as const satisfies DimensionPolicy

function boundedFor(width: number, depth: number, height: number): DimensionPolicy {
  const constraint = (value: number) => ({
    min: Math.max(1, Math.floor(value / 2)),
    max: value * 2,
    step: 10,
  })

  return {
    mode: 'bounded',
    axes: {
      width: constraint(width),
      depth: constraint(depth),
      height: constraint(height),
    },
  }
}

function port(id: string, en: string, ja: string, kind: string): CatalogPortDefinition {
  return { id, displayName: label(en, ja), kind, extensions: empty }
}

function box(
  id: string,
  category: string,
  displayName: LocalizedText,
  width: number,
  depth: number,
  height: number,
  capabilities: readonly string[] = [],
  ports: readonly CatalogPortDefinition[] = [],
  dimensionPolicy: DimensionPolicy = boundedFor(width, depth, height),
): CatalogDefinition {
  return {
    id,
    revision: '1',
    category,
    displayName,
    geometry: { kind: 'box' },
    defaultDimensions: { width, depth, height },
    dimensionPolicy,
    presets: [],
    materials: [
      { id: 'standard', displayName: label('Standard', '標準'), extensions: empty },
    ],
    capabilities,
    inspectorFields: [],
    ports,
    extensions: empty,
  }
}

const monitor27 = calculateSixteenByNinePanelDimensions(27)
const monitor24 = calculateSixteenByNinePanelDimensions(24)
const monitor32 = calculateSixteenByNinePanelDimensions(32)

export const GENERIC_CATALOG_DEFINITIONS: readonly CatalogDefinition[] = [
  box('room.basic', 'room', label('Room', '部屋'), 2700, 3600, 2400),
  box('room.floor', 'room', label('Floor', '床'), 2700, 3600, 30),
  box('room.wall', 'room', label('Wall', '壁'), 2700, 100, 2400),
  {
    id: 'desk.l-shaped-sit-stand',
    revision: '1',
    category: 'desk',
    displayName: label('L-shaped sit-stand desk', 'L字昇降デスク'),
    geometry: {
      kind: 'l-desk',
      mainTop: { width: 1800, depth: 700 },
      returnTop: { width: 1400, depth: 600 },
      returnSide: 'right',
    },
    defaultDimensions: { width: 1800, depth: 1400, height: 720 },
    dimensionPolicy: {
      mode: 'bounded',
      axes: {
        width: { min: 1200, max: 2400, step: 10 },
        depth: { min: 900, max: 2000, step: 10 },
        height: { min: 650, max: 1250, step: 10 },
      },
    },
    presets: [
      {
        id: 'seated',
        displayName: label('Seated', '着座'),
        dimensions: { height: 720 },
        extensions: empty,
      },
      {
        id: 'standing',
        displayName: label('Standing', '立位'),
        dimensions: { height: 1100 },
        extensions: empty,
      },
      {
        id: 'free-height',
        displayName: label('Free height', '自由高さ'),
        dimensions: {},
        extensions: empty,
      },
    ],
    materials: [
      { id: 'laminate', displayName: label('Laminate', 'ラミネート'), extensions: empty },
      { id: 'wood', displayName: label('Wood', '木目'), extensions: empty },
    ],
    capabilities: ['sit-stand', 'l-shaped'],
    inspectorFields: [
      {
        id: 'return-side',
        displayName: label('Return side', 'リターン位置'),
        type: 'select',
        extensions: empty,
      },
    ],
    ports: [
      {
        id: 'cable-tray',
        displayName: label('Cable tray', 'ケーブルトレー'),
        kind: 'cable',
        extensions: empty,
      },
    ],
    extensions: { returnSides: ['left', 'right'] },
  },
  box('desk.straight', 'desk', label('Straight desk', '直線デスク'), 1400, 700, 720),
  box('desk.shelf', 'desk', label('Desk shelf', 'デスク棚'), 900, 250, 400),
  box(
    'storage.shelf-cabinet',
    'storage',
    label('Storage shelf/cabinet', '収納棚・キャビネット'),
    800,
    400,
    1200,
  ),
  box('seating.chair', 'seating', label('Chair', 'チェア'), 650, 650, 1150, ['seating']),
  box(
    'computer.windows-tower',
    'computer',
    label('Windows tower', 'WindowsタワーPC'),
    220,
    450,
    450,
    ['compute'],
    [
      port('power-in', 'Power input', '電源入力', 'power'),
      port('display-out', 'Display output', '映像出力', 'display'),
      port('network', 'Network', 'ネットワーク', 'network'),
    ],
  ),
  box(
    'computer.mac',
    'computer',
    label('Mac computer', 'Mac'),
    300,
    250,
    60,
    ['compute'],
    [
      port('power-in', 'Power input', '電源入力', 'power'),
      port('display-out', 'Display output', '映像出力', 'display'),
      port('network', 'Network', 'ネットワーク', 'network'),
    ],
  ),
  box('computer.mini-pc', 'computer', label('Mini PC', 'ミニPC'), 150, 150, 50, [
    'compute',
  ]),
  {
    id: 'display.monitor',
    revision: '1',
    category: 'display',
    displayName: label('Monitor', 'モニター'),
    geometry: { kind: 'panel-with-stand', panel: monitor27 },
    defaultDimensions: {
      width: monitor27.width,
      depth: 220,
      height: monitor27.height + 120,
    },
    dimensionPolicy: {
      mode: 'bounded',
      axes: {
        width: { min: 300, max: 1200, step: 1 },
        depth: { min: 50, max: 500, step: 1 },
        height: { min: 200, max: 1000, step: 1 },
      },
    },
    presets: [
      {
        id: 'monitor-24',
        displayName: label('24-inch 16:9', '24インチ 16:9'),
        dimensions: { width: monitor24.width, height: monitor24.height + 120 },
        geometry: { panel: monitor24 },
        extensions: empty,
      },
      {
        id: 'monitor-27',
        displayName: label('27-inch 16:9', '27インチ 16:9'),
        dimensions: { width: monitor27.width, height: monitor27.height + 120 },
        geometry: { panel: monitor27 },
        extensions: empty,
      },
      {
        id: 'monitor-32',
        displayName: label('32-inch 16:9', '32インチ 16:9'),
        dimensions: { width: monitor32.width, height: monitor32.height + 120 },
        geometry: { panel: monitor32 },
        extensions: empty,
      },
    ],
    materials: [
      {
        id: 'matte-black',
        displayName: label('Matte black', 'マットブラック'),
        extensions: empty,
      },
    ],
    capabilities: ['display'],
    inspectorFields: [],
    ports: [port('display-input', 'Display input', '映像入力', 'display')],
    extensions: empty,
  },
  box(
    'display.information',
    'display',
    label('Information display', '情報ディスプレイ'),
    500,
    100,
    300,
    ['display'],
    [port('display-input', 'Display input', '映像入力', 'display')],
  ),
  box(
    'mount.monitor-arm',
    'mount',
    label('Monitor arm', 'モニターアーム'),
    120,
    120,
    450,
    ['mount'],
    [],
    fixed,
  ),
  box(
    'light.display',
    'light',
    label('Display light', 'ディスプレイライト'),
    450,
    80,
    50,
    ['lighting'],
    [port('power-in', 'Power input', '電源入力', 'power')],
  ),
  box('printer.generic', 'printer', label('Printer', 'プリンター'), 500, 400, 300, [
    'print',
  ]),
  box(
    'power.strip',
    'power',
    label('Power strip', '電源タップ'),
    350,
    60,
    35,
    ['power'],
    [port('outlet', 'Outlet', 'コンセント', 'power')],
  ),
  box(
    'cable.generic',
    'cable',
    label('Cable', 'ケーブル'),
    1000,
    20,
    20,
    ['power', 'display', 'network'],
    [port('end-a', 'End A', '端子A', 'cable'), port('end-b', 'End B', '端子B', 'cable')],
    free,
  ),
  box('waste.trash-bin', 'waste', label('Trash bin', 'ごみ箱'), 300, 300, 500),
  box('sleep.bed-futon', 'sleep', label('Bed/futon', 'ベッド・布団'), 1000, 2000, 350),
  box('table.side', 'table', label('Side table', 'サイドテーブル'), 450, 450, 500),
  box('light.room', 'light', label('Room light', '室内照明'), 600, 600, 100, [
    'lighting',
  ]),
  box('storage.clothes', 'storage', label('Clothes storage', '衣類収納'), 800, 500, 1800),
]
