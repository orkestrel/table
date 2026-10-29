import type { TableRow, TableSchema } from './types.js'
import { attempt, cloneJSONRecord, isContractError } from '@orkestrel/contract'
import { TableError } from './errors.js'

/**
 * Clones one row into an owned frozen snapshot.
 *
 * @param row - The row to own.
 * @returns A frozen copy of the row's cells.
 */
export function cloneRow(row: TableRow): TableRow {
	return Object.freeze({ ...row })
}

/**
 * Clones a whole schema into an owned frozen snapshot, freezing every nested column, choice list,
 * choice, and `meta`; raises `SCHEMA` for a `meta` it cannot own.
 *
 * @param schema - The schema to own.
 * @returns A frozen schema with every nested column, choice, list, and metadata record owned.
 */
export function cloneSchema(schema: TableSchema): TableSchema {
	return Object.freeze({
		...schema,
		columns: Object.freeze(
			schema.columns.map((column) => {
				const owned =
					column.meta === undefined ? undefined : attempt(() => cloneJSONRecord(column.meta))
				if (owned !== undefined && !owned.success) {
					if (!isContractError(owned.error)) throw owned.error
					throw new TableError(
						'SCHEMA',
						`column "${column.key}" has metadata that cannot be owned`,
						{ column: column.key },
					)
				}
				const meta = owned === undefined ? {} : { meta: owned.value }

				if (column.cell === 'choice') {
					return Object.freeze({
						...column,
						...meta,
						choices: Object.freeze(column.choices.map((choice) => Object.freeze({ ...choice }))),
					})
				}

				return Object.freeze({ ...column, ...meta })
			}),
		),
	})
}
