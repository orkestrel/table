import type { ColumnCell } from './types.js'

/** Lists every column cell, in the order declared by the public contract. */
export const COLUMN_CELLS: readonly ColumnCell[] = Object.freeze([
	'text',
	'number',
	'flag',
	'choice',
])

/** Names the maximum number of columns one schema may declare. */
export const COLUMN_LIMIT = 256

/** Names the maximum number of choices one `choice` column may offer. */
export const CHOICE_LIMIT = 1024

/** Names the maximum length, in UTF-16 code units, of a schema name or column key. */
export const NAME_LIMIT = 128

/** Names the maximum length, in UTF-16 code units, of any single retained string. */
export const STRING_LIMIT = 65536

/** Names the maximum total length, in UTF-16 code units, of every string one schema retains. */
export const TEXT_LIMIT = 1048576

/** Names the maximum total number of records, arrays, and leaves one schema retains. */
export const NODE_LIMIT = 16384
