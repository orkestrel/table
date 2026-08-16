import type { JSONRecord } from '@orkestrel/contract'
import type { TableRow, TableSchema } from './types.js'
import { cloneJSONRecord, isContractError } from '@orkestrel/contract'
import { TableError } from './errors.js'

/**
 * Clone one row into an owned frozen snapshot.
 *
 * @param row - The row to own.
 * @returns A frozen copy of the row's cells.
 */
export function cloneRow(row: TableRow): TableRow {
	return Object.freeze({ ...row })
}

/**
 * Clone a table schema into an owned frozen snapshot.
 *
 * @param schema - The schema to own.
 * @returns A frozen schema with every nested column, choice, list, and metadata record owned.
 */
export function cloneSchema(schema: TableSchema): TableSchema {
	return Object.freeze({
		...schema,
		columns: Object.freeze(
			schema.columns.map((column) => {
				let meta: { meta?: JSONRecord } = {}

				if (column.meta !== undefined) {
					try {
						meta = { meta: cloneJSONRecord(column.meta) }
					} catch (error) {
						if (!isContractError(error)) throw error
						throw new TableError(
							'SCHEMA',
							`column "${column.key}" has metadata that cannot be owned`,
							{ column: column.key },
						)
					}
				}

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
