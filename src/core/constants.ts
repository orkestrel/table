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
