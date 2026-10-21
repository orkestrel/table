import type { TableProjection } from './types.js'
import type { TableRow, TableSchema } from '@src/core'
import { parseJSON } from '@orkestrel/contract'
import { parseRows, parseTable } from '@src/core'
import { TableBindingError } from './errors.js'

/** Reads declared header metadata and explicit row keys into a validated core projection.
 * @param element - A native table with data-table-key naming its identity column.
 * @returns The schema and rows, validated together before any mutation.
 * @throws A binding error when metadata, identities, or cells are malformed.
 * @example
 * ```ts
 * import { createTable } from '@orkestrel/table'
 * import { readTable } from '@orkestrel/table/browser'
 * const element = document.createElement('table')
 * element.setAttribute('data-table-key', 'id')
 * element.innerHTML = '<thead><tr><th data-table-column="id" data-table-cell="text">Reference</th></tr></thead><tbody></tbody>'
 * const projection = readTable(element)
 * const table = createTable(projection.schema, { rows: projection.rows })
 * ```
 */
export function readTable(element: HTMLTableElement): TableProjection {
	const schema = readTableSchema(element)
	return { schema, rows: readTableRows(schema, Array.from(element.tBodies[0]?.rows ?? [])) }
}

/** Reads and validates explicit native header metadata.
 * @param element - The table declaring its identity column and cell kinds.
 * @returns The core schema described by the native headers.
 */
export function readTableSchema(element: HTMLTableElement): TableSchema {
	const columns = Array.from(element.tHead?.querySelectorAll('th[data-table-column]') ?? [])
		.filter((header) => header.closest('table') === element)
		.map((header) => ({
			key: header.getAttribute('data-table-column'),
			cell: header.getAttribute('data-table-cell'),
			label: header.textContent?.trim() ?? '',
			...(header.hasAttribute('data-table-choices')
				? { choices: parseJSON(header.getAttribute('data-table-choices') ?? '') }
				: {}),
		}))
	const schema = parseTable({ key: element.getAttribute('data-table-key'), columns })
	if (schema === undefined || element.tBodies.length !== 1)
		throw new TableBindingError(
			'STRUCTURE',
			'Declare one body, an identity column, and valid header metadata',
		)
	return schema
}

/** Reads explicit keys and declared direct cells against a core schema.
 * @param schema - The declared columns and identity column.
 * @param elements - Data rows belonging to one table, including retained detached rows.
 * @returns Validated rows in the supplied order.
 * @throws A binding error for duplicate keys, undeclared cells, or malformed values.
 */
export function readTableRows(
	schema: TableSchema,
	elements: readonly HTMLTableRowElement[],
): readonly TableRow[] {
	const candidates = elements.map((element) => {
		const cells: Record<string, unknown> = { [schema.key]: element.getAttribute('data-table-key') }
		const seen = new Set<string>()
		for (const cell of element.cells) {
			const column = cell.getAttribute('data-table-column')
			if (column === null) continue
			if (seen.has(column))
				throw new TableBindingError('STRUCTURE', 'A row repeats a declared cell')
			seen.add(column)
			const value = cell.querySelector('data[value], time[datetime]')
			const text =
				value?.closest('table') === element.closest('table')
					? (value?.getAttribute('value') ?? value?.getAttribute('datetime') ?? '')
					: (cell.textContent ?? '')
			if (column === schema.key && text !== cells[schema.key])
				throw new TableBindingError('STRUCTURE', 'The identity cell disagrees with its row key')
			Object.defineProperty(cells, column, { value: text, enumerable: true, configurable: true })
		}
		return cells
	})
	const rows = parseRows(schema, candidates)
	if (rows === undefined)
		throw new TableBindingError('STRUCTURE', 'Native row keys or cells are invalid')
	return rows
}
