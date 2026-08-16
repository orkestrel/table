import type { TableInterface, TableOptions, TableSchema } from './types.js'
import { Table } from './Table.js'

/**
 * Open a table against a schema.
 *
 * @param schema - The table declaration to own.
 * @param options - Initial rows, lens overrides, pagination, and emitter wiring.
 * @returns A live table interface.
 * @throws A {@link TableError} coded `SCHEMA` when the schema is unusable, `KEY` when a seeded
 *   identity is unusable or repeated, and `CELL` when a seeded cell is invalid.
 * @example
 * ```ts
 * const table = createTable({ key: 'id', columns: [{ cell: 'text', key: 'id' }] })
 * table.rows.add({ id: '1' })
 * ```
 */
export function createTable(schema: TableSchema, options?: TableOptions): TableInterface {
	return new Table(schema, options)
}
