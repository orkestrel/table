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
export function compareTextByLength(
	left: TableCell | undefined,
	right: TableCell | undefined,
): number {
	return String(left ?? '').length - String(right ?? '').length
}

/**
 * Build the shared filter-admissibility behavior matrix.
 *
 * @returns Matching cells and filters spanning admitted and refused combinations.
 */
export function createFilterAdmissibilityVectors(): ReadonlyArray<{
	readonly column: TableColumn
	readonly filter: TableFilter
	readonly cell: TableCell | undefined
	readonly admitted: boolean
}> {
	const columns = createTableSchema().columns
	const text = columns.find((column) => column.key === 'name')
	const number = columns.find((column) => column.key === 'age')
	const flag = columns.find((column) => column.key === 'active')
	const choice = columns.find((column) => column.key === 'status')
	if (text === undefined || number === undefined || flag === undefined || choice === undefined) {
		throw new Error('Expected fixture columns')
	}

	return [
		{
			column: text,
			filter: { column: 'name', operator: 'contains', text: 'd' },
			cell: 'Ada',
			admitted: true,
		},
		{
			column: number,
			filter: { column: 'age', operator: 'between', minimum: 30, maximum: 40 },
			cell: 36,
			admitted: true,
		},
		{
			column: flag,
			filter: { column: 'active', operator: 'equals', value: true },
			cell: true,
			admitted: true,
		},
		{
			column: choice,
			filter: { column: 'status', operator: 'contains', text: 'iv' },
			cell: 'live',
			admitted: true,
		},
		{
			column: number,
			filter: { column: 'age', operator: 'contains', text: '3' },
			cell: 36,
			admitted: false,
		},
		{
			column: flag,
			filter: { column: 'active', operator: 'between', minimum: 0, maximum: 1 },
			cell: true,
			admitted: false,
		},
		{
			column: choice,
			filter: { column: 'status', operator: 'between', minimum: 'draft', maximum: 'live' },
			cell: 'live',
			admitted: false,
		},
		{
			column: number,
			filter: { column: 'age', operator: 'equals', value: '36' },
			cell: 36,
			admitted: false,
		},
		{
			column: choice,
			filter: { column: 'status', operator: 'equals', value: 'missing' },
			cell: 'live',
			admitted: false,
		},
	]
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

// Run `operation`, returning a thrown `TableError`'s `code` (or a named literal) — so an error
// code is asserted unconditionally, never inside a conditional `expect`. Mirrors the sqlite
// package's `sqliteErrorCode` in `tests/setupServer.ts`.
export function readTableError(
	operation: () => unknown,
): TableErrorCode | 'NOT_TABLE_ERROR' | 'NO_THROW' {
	try {
		operation()
		return 'NO_THROW'
	} catch (error) {
		return isTableError(error) ? error.code : 'NOT_TABLE_ERROR'
	}
}

/** Exercise every public table write after teardown. */
export function readDestroyedWrites(
	table: TableInterface,
): ReadonlyArray<TableErrorCode | 'NOT_TABLE_ERROR' | 'NO_THROW'> {
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
