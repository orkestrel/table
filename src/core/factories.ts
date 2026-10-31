import type { GridInterface, GridOptions, GridSchema } from './types.js'
import { Grid } from './Grid.js'

/**
 * Opens a grid against a schema. The schema is copied, and the copy is what the grid declares.
 *
 * @param schema - The grid declaration to own.
 * @param options - Initial rows, lens overrides, pagination, and emitter wiring.
 * @returns A live grid interface.
 * @throws A {@link GridError} coded `SCHEMA` when the schema is unusable, `KEY` when a seeded
 *   identity is unusable or repeated, and `CELL` when a seeded cell is invalid.
 * @example Open a grid
 * ```ts
 * import { createGrid } from '@orkestrel/table'
 *
 * const grid = createGrid(
 * 	{
 * 		label: 'People',
 * 		key: 'id',
 * 		columns: [
 * 			{ cell: 'text', key: 'id', label: 'Reference' },
 * 			{ cell: 'text', key: 'name', label: 'Name' },
 * 			{ cell: 'number', key: 'age', label: 'Age' },
 * 		],
 * 	},
 * 	{
 * 		rows: [
 * 			{ id: '1', name: 'Ada', age: 36 },
 * 			{ id: '2', name: 'Grace', age: 45 },
 * 			{ id: '3', name: 'Alan', age: 41 },
 * 		],
 * 		limit: 2,
 * 	},
 * )
 *
 * grid.filter.set({ column: 'name', operator: 'contains', text: 'a' })
 * grid.sort.set({ column: 'age', direction: 'descending' })
 *
 * grid.count // 3 — every name holds a lowercase 'a'
 * grid.pagination.count // 2 — two pages of two
 * grid.view.map((row) => row.name) // ['Grace', 'Alan'] — page one, oldest first
 * ```
 */
export function createGrid(schema: GridSchema, options?: GridOptions): GridInterface {
	return new Grid(schema, options)
}
