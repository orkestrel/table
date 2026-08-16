import type { JSONValue } from '@orkestrel/contract'
import type {
	TableCell,
	TableColumn,
	TableErrorCode,
	TableFilter,
	TableInterface,
	TableOptions,
	TableRow,
	TableSchema,
} from '@src/core'
import { attempt } from '@orkestrel/contract'
import { createTable, isTableError, STRING_LIMIT, TEXT_LIMIT } from '@src/core'

/** Compare text with numeric segments in natural lexical order. */
export function compareTextNaturally(
	left: TableCell | undefined,
	right: TableCell | undefined,
): number {
	return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true })
}

/** Match a contains filter after folding text to lowercase. */
export function matchTextLoosely(cell: TableCell | undefined, filter: TableFilter): boolean {
	return (
		filter.operator === 'contains' &&
		String(cell ?? '')
			.toLowerCase()
			.includes(filter.text.toLowerCase())
	)
}

/** Compare text by its string length. */
export function compareTextLength(
	left: TableCell | undefined,
	right: TableCell | undefined,
): number {
	return String(left ?? '').length - String(right ?? '').length
}

/** Build a fresh schema spanning every column cell. */
export function createTableSchema(): TableSchema {
	return {
		name: 'people',
		label: 'People',
		help: 'A complete table schema',
		key: 'id',
		columns: [
			{ cell: 'text', key: 'id', label: 'Reference' },
			{ cell: 'text', key: 'name', label: 'Name' },
			{ cell: 'number', key: 'age', label: 'Age', meta: { align: 'end' } },
			{ cell: 'flag', key: 'active', label: 'Active' },
			{
				cell: 'choice',
				key: 'status',
				label: 'Status',
				choices: [
					{ value: 'draft', label: 'Draft' },
					{ value: 'live', label: 'Live' },
					{ value: 'archived', label: 'Archived', help: 'Kept for history' },
				],
			},
		],
	}
}

/** Build fresh rows spanning present and absent cells. */
export function createTableRows(): readonly TableRow[] {
	return [
		{ id: '1', name: 'Ada', age: 36, active: true, status: 'live' },
		{ id: '2', name: 'Grace', age: 45, active: false, status: 'draft' },
		{ id: '3', name: 'Alan', age: 41, active: true, status: 'live' },
		{ id: '4', name: 'Lin', active: false, status: 'archived' },
	]
}

/** Open a table over the shared schema and row population. */
export function createTableFixture(options?: TableOptions): TableInterface {
	const rows = options?.rows ?? createTableRows()
	return createTable(createTableSchema(), options === undefined ? { rows } : { ...options, rows })
}

/** Read the table-domain error code raised by one operation. */
export function readTableError(operation: () => unknown): TableErrorCode | undefined {
	const outcome = attempt(operation)
	return outcome.success || !isTableError(outcome.error) ? undefined : outcome.error.code
}

/** Exercise every public table write after teardown. */
export function readDestroyedWrites(
	table: TableInterface,
): ReadonlyArray<TableErrorCode | undefined> {
	return [
		readTableError(() => table.rows.add({ id: 'late' })),
		readTableError(() => table.rows.update({ id: '1', name: 'late' })),
		readTableError(() => table.rows.move('1', 0)),
		readTableError(() => table.rows.remove('1')),
		readTableError(() => table.sort.set({ column: 'name', direction: 'ascending' })),
		readTableError(() => table.sort.remove('name')),
		readTableError(() => table.filter.set({ column: 'name', operator: 'contains', text: 'a' })),
		readTableError(() => table.filter.remove('name')),
		readTableError(() => table.selection.select('1')),
		readTableError(() => table.selection.clear('1')),
		readTableError(() => table.selection.toggle('1')),
		readTableError(() => table.expansion.expand('1')),
		readTableError(() => table.expansion.clear('1')),
		readTableError(() => table.expansion.toggle('1')),
		readTableError(() => table.pagination.move(1)),
		readTableError(() => table.pagination.resize(2)),
		readTableError(() => table.clear()),
	]
}

/** Build a schema with an exact column population. */
export function createColumnBudgetSchema(count: number): TableSchema {
	const columns: TableColumn[] = []
	for (let index = 0; index < count; index += 1) {
		columns.push({ cell: 'text', key: index === 0 ? 'id' : `column-${index}` })
	}
	return { key: 'id', columns }
}

/** Build a schema with an exact choice population. */
export function createChoiceBudgetSchema(count: number): TableSchema {
	return {
		key: 'id',
		columns: [
			{ cell: 'text', key: 'id' },
			{
				cell: 'choice',
				key: 'status',
				choices: Array.from({ length: count }, (_, index) => ({
					value: String(index),
					label: String(index),
				})),
			},
		],
	}
}

/** Build a schema at the whole-text budget plus an optional delta. */
export function createTextBudgetSchema(extra = 0): TableSchema {
	const meta: Record<string, JSONValue> = {}
	let remaining = TEXT_LIMIT - 46 + extra
	for (let index = 0; index < 16; index += 1) {
		const length = Math.min(STRING_LIMIT, remaining)
		meta[`k${index}`] = 'x'.repeat(length)
		remaining -= length
	}
	return { key: 'id', columns: [{ cell: 'text', key: 'id', meta }] }
}

/** Build a schema at the whole-node budget plus an optional delta. */
export function createNodeBudgetSchema(extra = 0): TableSchema {
	return {
		key: 'id',
		columns: [
			{
				cell: 'text',
				key: 'id',
				meta: { nodes: Array.from({ length: 16376 + extra }, () => null) },
			},
		],
	}
}
