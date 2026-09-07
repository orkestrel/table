import type { ColumnCell } from './types.js'

/** Lists every column cell, in the order declared by the public contract. */
export const COLUMN_CELLS: readonly ColumnCell[] = Object.freeze([
	'text',
	'number',
	'flag',
	'choice',
])

/** Names the maximum number of columns one schema may declare: 256. */
export const COLUMN_LIMIT = 256

/** Names the maximum number of choices one `choice` column may offer: 1024. */
export const CHOICE_LIMIT = 1024

/** Names the maximum length of a schema name or column key: 128 UTF-16 code units. */
export const NAME_LIMIT = 128

/** Names the maximum length of any single retained string: 65536 UTF-16 code units. */
export const STRING_LIMIT = 65536

/**
 * Names the maximum total length of every string one schema retains: 1048576 UTF-16 code units.
 */
export const TEXT_LIMIT = 1048576

/** Names the maximum total number of records, arrays, and leaves one schema retains: 16384. */
export const NODE_LIMIT = 16384
