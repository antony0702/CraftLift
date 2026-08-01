import type { ServerProperties } from './types'

/**
 * The server.properties settings ordinary players actually want to change.
 *
 * Shared by the create wizard and the settings tab. Written twice, the two
 * would eventually disagree, and the user would find that what they filled in
 * when creating is not what they see afterwards. Rarely-touched settings are
 * left out; the file itself is still editable in the "files" tab.
 */
export type PropertyField =
  | { key: string; kind: 'text'; createOnly?: true }
  | { key: string; kind: 'number'; min: number; max: number }
  | { key: string; kind: 'select'; options: string[] }
  | {
      key: string
      kind: 'bool'
      /**
       * The checkbox shows the opposite of the stored value.
       *
       * For settings that should be on by default: phrased positively, every
       * user would have to tick the box on a new server just to get the usual
       * setup — work that is wrong not to do. Phrased negatively, leaving it
       * alone is already right.
       */
      negate?: true
    }

export const PROPERTY_FIELDS: PropertyField[] = [
  { key: 'motd', kind: 'text' },
  { key: 'max-players', kind: 'number', min: 1, max: 200 },
  { key: 'difficulty', kind: 'select', options: ['peaceful', 'easy', 'normal', 'hard'] },
  { key: 'gamemode', kind: 'select', options: ['survival', 'creative', 'adventure', 'spectator'] },
  // The seed only means anything while the world is first generated, so it
  // appears in the create flow only. Kept afterwards it would be a field that
  // does nothing when you change it.
  { key: 'level-seed', kind: 'text', createOnly: true },
  { key: 'pvp', kind: 'bool', negate: true },
  { key: 'hardcore', kind: 'bool' },
  { key: 'white-list', kind: 'bool' },
  { key: 'online-mode', kind: 'bool' },
  { key: 'allow-flight', kind: 'bool' },
  { key: 'enable-command-block', kind: 'bool' },
  { key: 'view-distance', kind: 'number', min: 3, max: 32 },
  { key: 'simulation-distance', kind: 'number', min: 3, max: 32 },
  { key: 'spawn-protection', kind: 'number', min: 0, max: 100 }
]

/**
 * What a new server starts with.
 *
 * white-list=true means that the moment the server exists, not even its owner
 * can get in until a player is on the list. That is deliberate — a public
 * Minecraft server is found by scanners within minutes, and no whitelist is an
 * open door. The create screen shows this tick so it is not a surprise.
 *
 * allow-nether and spawn-monsters are not offered as options: almost nobody
 * turns them off, and a checkbox nobody touches is just clutter. Anyone who
 * really wants them can edit the file in the "files" tab.
 */
export const DEFAULT_PROPERTIES: ServerProperties = {
  motd: 'CraftLift 伺服器',
  'max-players': '10',
  difficulty: 'hard',
  gamemode: 'survival',
  'level-seed': '',
  pvp: 'true',
  hardcore: 'false',
  'white-list': 'true',
  'online-mode': 'true',
  'allow-nether': 'true',
  'allow-flight': 'false',
  'spawn-monsters': 'true',
  'enable-command-block': 'false',
  'view-distance': '10',
  'simulation-distance': '10',
  'spawn-protection': '16'
}
