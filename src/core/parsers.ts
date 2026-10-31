import type { GridCell, GridRow, GridSchema } from './types.js'
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
import { extractColumn, extractGridKey, matchesCell, serializeGrid } from './helpers.js'
import { isGridSchema } from './validators.js'

/**
 * Parses unknown wire data into an owned, structurally valid, semantically sound grid schema.
 *
 * @param input - The unknown schema value to parse.
 * @returns An owned grid schema, or `undefined` on refusal.
 */
export function parseGrid(input: unknown): GridSchema | undefined {
	const outcome = attempt(() => {
		if (!isGridSchema(input)) return undefined
		const projected = serializeGrid(input)
		return isGridSchema(projected) ? projected : undefined
	})

	return outcome.success ? outcome.value : undefined
}

/**
 * Parses unknown wire data into owned rows against one grid schema, coercing a numeric string
 * and `'true'` / `'false'`.
 *
 * @param schema - The schema that declares the accepted keys and cell shapes.
 * @param input - The unknown row-list value to parse.
 * @returns Frozen owned rows, or `undefined` when any row is refused.
 */
export function parseRows(schema: GridSchema, input: unknown): readonly GridRow[] | undefined {
	const outcome = attempt(() => {
		if (!isGridSchema(schema) || !isArray(input)) {
			return undefined
		}

		const read = readArrayEntries(input)
		if (!read.success || !read.value.dense) return undefined

		const keys = new Set<string>()
		const rows: GridRow[] = []

		for (const candidate of read.value.entries) {
			if (!isRecord(candidate)) return undefined
			const row: Record<string, GridCell> = {}

			for (const key of Reflect.ownKeys(candidate)) {
				if (!isString(key) || !Object.hasOwn(candidate, key)) return undefined
				const column = extractColumn(schema, key)
				if (column === undefined) return undefined
				const inputCell = candidate[key]
				if (column.cell === 'number' && isString(inputCell) && inputCell.length > STRING_LIMIT)
					return undefined
				const cell: unknown =
					column.cell === 'number' && isString(inputCell)
						? parseNumber(inputCell)
						: column.cell === 'flag' && inputCell === 'true'
							? true
							: column.cell === 'flag' && inputCell === 'false'
								? false
								: inputCell

				if (!matchesCell(column, cell)) return undefined
				Object.defineProperty(row, key, {
					value: cell,
					enumerable: true,
					configurable: true,
					writable: true,
				})
			}

			const owned = cloneRow(row)
			const key = extractGridKey(schema, owned)
			if (key === undefined || keys.has(key)) return undefined
			keys.add(key)
			rows.push(owned)
		}

		return Object.freeze(rows)
	})

	return outcome.success ? outcome.value : undefined
}
