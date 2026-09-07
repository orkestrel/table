import type { TableInterface, TableOptions, TableSchema } from './types.js'
import { Table } from './Table.js'

/**
 * Opens a table against a schema. The schema is copied, and the copy is what the table declares.
 *
 * @param schema - The table declaration to own.
 * @param options - Initial rows, lens overrides, pagination, and emitter wiring.
 * @returns A live table interface.
 * @throws A {@link TableError} coded `SCHEMA` when the schema is unusable, `KEY` when a seeded
 *   identity is unusable or repeated, and `CELL` when a seeded cell is invalid.
 * @example Open a table
 * ```ts
 * import { createTable } from '@orkestrel/table'
 *
 * const table = createTable(
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
 * table.filter.set({ column: 'name', operator: 'contains', text: 'a' })
 * table.sort.set({ column: 'age', direction: 'descending' })
 *
 * table.count // 3 — every name holds a lowercase 'a'
 * table.pagination.count // 2 — two pages of two
 * table.view.map((row) => row.name) // ['Grace', 'Alan'] — page one, oldest first
 * ```
 */
export function createTable(schema: TableSchema, options?: TableOptions): TableInterface {
	return new Table(schema, options)
}
