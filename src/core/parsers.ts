import type { TableCell, TableRow, TableSchema } from './types.js'
import {
	attempt,
	isArray,
	isRecord,
	isString,
	parseNumber,
	readArrayEntries,
} from '@orkestrel/contract'
import { cloneRow } from './cloners.js'
import { STRING_LIMIT } from './constants.js'
import { auditTable, extractColumn, extractKey, matchesCell, serializeTable } from './helpers.js'
import { isTableSchema } from './validators.js'

/**
 * Parse unknown wire data into an owned, semantically sound table schema.
 *
 * @param input - The unknown schema value to parse.
 * @returns An owned table schema, or `undefined` on refusal.
 */
export function parseTable(input: unknown): TableSchema | undefined {
	const outcome = attempt(() => {
		if (!isTableSchema(input) || auditTable(input).length !== 0) return undefined
		const projected = serializeTable(input)
		return isTableSchema(projected) && auditTable(projected).length === 0 ? projected : undefined
	})

	return outcome.success ? outcome.value : undefined
}

/**
 * Parse unknown wire rows against one table schema.
 *
 * @param schema - The schema that declares the accepted keys and cell shapes.
 * @param input - The unknown row-list value to parse.
 * @returns Frozen owned rows, or `undefined` when any row is refused.
 */
export function parseRows(schema: TableSchema, input: unknown): readonly TableRow[] | undefined {
	const outcome = attempt(() => {
		if (!isTableSchema(schema) || auditTable(schema).length !== 0 || !isArray(input)) {
			return undefined
		}

		const read = readArrayEntries(input)
		if (!read.success || !read.value.dense) return undefined

		const keys = new Set<string>()
		const rows: TableRow[] = []

		for (const candidate of read.value.entries) {
			if (!isRecord(candidate)) return undefined
			const row: Record<string, TableCell> = {}

			for (const key of Reflect.ownKeys(candidate)) {
				if (!isString(key) || !Object.hasOwn(candidate, key)) return undefined
				const column = extractColumn(schema, key)
				if (column === undefined) return undefined
				const inputCell = candidate[key]
				let cell: unknown = inputCell

				if (column.cell === 'number' && isString(inputCell)) {
					if (inputCell.length > STRING_LIMIT) return undefined
					cell = parseNumber(inputCell)
				} else if (column.cell === 'flag' && inputCell === 'true') {
					cell = true
				} else if (column.cell === 'flag' && inputCell === 'false') {
					cell = false
				}

				if (!matchesCell(column, cell)) return undefined
				Object.defineProperty(row, key, {
					value: cell,
					enumerable: true,
					configurable: true,
					writable: true,
				})
			}

			const owned = cloneRow(row)
			const key = extractKey(schema, owned)
			if (key === undefined || keys.has(key)) return undefined
			keys.add(key)
			rows.push(owned)
		}

		return Object.freeze(rows)
	})

	return outcome.success ? outcome.value : undefined
}
