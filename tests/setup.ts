import type { JSONRecord, JSONValue } from '@orkestrel/contract'
import type {
	CellComparator,
	GridOrder,
	GridKey,
	GridCell,
	GridColumn,
	GridErrorCode,
	GridFilter,
	GridInterface,
	GridOptions,
	GridRow,
	GridSchema,
} from '@src/core'
import { createGrid, isGridError, STRING_LIMIT, TEXT_LIMIT } from '@src/core'

/** Compares text with numeric segments in natural lexical order. */
export function compareTextNaturally(
	left: GridCell | undefined,
	right: GridCell | undefined,
): number {
	return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true })
}

/** Matches a contains filter after folding text to lowercase. */
export function matchTextLoosely(cell: GridCell | undefined, filter: GridFilter): boolean {
	return (
		filter.operator === 'contains' &&
		String(cell ?? '')
			.toLowerCase()
			.includes(filter.text.toLowerCase())
	)
}

/** Compares text by its string length. */
export function compareTextByLength(
	left: GridCell | undefined,
	right: GridCell | undefined,
): number {
	return String(left ?? '').length - String(right ?? '').length
}

/**
 * Builds the shared filter-admissibility behavior matrix.
 *
 * @returns Matching cells and filters spanning admitted and refused combinations.
 */
export function createFilterAdmissibilityVectors(): ReadonlyArray<{
	readonly column: GridColumn
	readonly filter: GridFilter
	readonly cell: GridCell | undefined
	readonly admitted: boolean
}> {
	const columns = createGridSchema().columns
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

/** Builds a fresh schema spanning every column cell. */
export function createGridSchema(): GridSchema {
	return {
		name: 'people',
		label: 'People',
		help: 'A complete grid schema',
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

/** Builds fresh rows spanning present and absent cells. */
export function createGridRows(): readonly GridRow[] {
	return [
		{ id: '1', name: 'Ada', age: 36, active: true, status: 'live' },
		{ id: '2', name: 'Grace', age: 45, active: false, status: 'draft' },
		{ id: '3', name: 'Alan', age: 41, active: true, status: 'live' },
		{ id: '4', name: 'Lin', active: false, status: 'archived' },
	]
}

/** Opens a grid over the shared schema and row population. */
export function createGridFixture(options?: GridOptions): GridInterface {
	const rows = options?.rows ?? createGridRows()
	return createGrid(createGridSchema(), options === undefined ? { rows } : { ...options, rows })
}

// Run `operation`, returning a thrown `GridError`'s `code` (or a named literal) — so an error
// code is asserted unconditionally, never inside a conditional `expect`. Mirrors the sqlite
// package's `sqliteErrorCode` in `tests/setupServer.ts`.
export function readGridError(
	operation: () => unknown,
): GridErrorCode | 'NOT_GRID_ERROR' | 'NO_THROW' {
	try {
		operation()
		return 'NO_THROW'
	} catch (error) {
		return isGridError(error) ? error.code : 'NOT_GRID_ERROR'
	}
}

/** Exercises every public grid write after teardown. */
export function readDestroyedWrites(
	grid: GridInterface,
): ReadonlyArray<GridErrorCode | 'NOT_GRID_ERROR' | 'NO_THROW'> {
	return [
		readGridError(() => grid.rows.add({ id: 'late' })),
		readGridError(() => grid.rows.update({ id: '1', name: 'late' })),
		readGridError(() => grid.rows.move('1', 0)),
		readGridError(() => grid.rows.remove('1')),
		readGridError(() => grid.sort.set({ column: 'name', direction: 'ascending' })),
		readGridError(() => grid.sort.remove('name')),
		readGridError(() => grid.filter.set({ column: 'name', operator: 'contains', text: 'a' })),
		readGridError(() => grid.filter.remove('name')),
		readGridError(() => grid.selection.select('1')),
		readGridError(() => grid.selection.clear('1')),
		readGridError(() => grid.selection.toggle('1')),
		readGridError(() => grid.expansion.expand('1')),
		readGridError(() => grid.expansion.clear('1')),
		readGridError(() => grid.expansion.toggle('1')),
		readGridError(() => grid.pagination.move(1)),
		readGridError(() => grid.pagination.resize(2)),
		readGridError(() => grid.clear()),
	]
}

/** Builds a schema with an exact column population. */
export function createColumnBudgetSchema(count: number): GridSchema {
	const columns = Array.from<unknown, GridColumn>({ length: count }, (_, index) => ({
		cell: 'text',
		key: index === 0 ? 'id' : `column-${index}`,
	}))
	return { key: 'id', columns }
}

/** Builds a schema with an exact choice population. */
export function createChoiceBudgetSchema(count: number): GridSchema {
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

/** Builds a schema at the whole-text budget plus an optional delta. */
export function createTextBudgetSchema(extra = 0): GridSchema {
	const meta: Record<string, JSONValue> = Object.fromEntries(
		Array.from({ length: 16 }, (_, index) => [
			`k${index}`,
			'x'.repeat(
				Math.min(STRING_LIMIT, Math.max(0, TEXT_LIMIT - 46 + extra - index * STRING_LIMIT)),
			),
		]),
	)
	return { key: 'id', columns: [{ cell: 'text', key: 'id', meta }] }
}

/** Builds nested metadata with the requested depth. */
export function createDeepMetadata(depth: number): JSONRecord {
	return Array.from({ length: depth }).reduce<JSONRecord>((nested) => ({ next: nested }), {})
}

/** Builds a schema whose metadata contains an accessor. */
export function createAccessorSchema(): GridSchema {
	return {
		key: 'id',
		columns: [
			{
				cell: 'text',
				key: 'id',
				meta: {
					get icon() {
						return 'key'
					},
				},
			},
		],
	}
}

/** Counts metadata reads and returns a cycle after the stable reads are exhausted. */
export class TestMetadata {
	#calls = 0
	readonly #stable: number

	constructor(stable: number) {
		this.#stable = stable
	}

	get calls(): number {
		return this.#calls
	}

	read(): JSONRecord {
		this.#calls += 1
		if (this.#calls <= this.#stable) return { align: 'end' }
		const cyclic: Record<string, JSONValue> = {}
		cyclic.self = cyclic
		return cyclic
	}
}

/** Builds a schema at the whole-node budget plus an optional delta. */
export function createNodeBudgetSchema(extra = 0): GridSchema {
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

/** Compares the direction of grid order declarations. */
export function matchDirection(first: GridOrder, second: GridOrder): boolean {
	return first.direction === second.direction
}

/** Compares cells as text in descending lexical order. */
export const compareCellsReverse: CellComparator = (left, right) =>
	String(right ?? '').localeCompare(String(left ?? ''))

/** Holds the selected keys supplied to a key manager. */
export class KeyStore {
	#keys: ReadonlySet<GridKey>

	constructor(keys: readonly GridKey[] = []) {
		this.#keys = new Set(keys)
	}

	get keys(): ReadonlySet<GridKey> {
		return this.#keys
	}

	set keys(keys: ReadonlySet<GridKey>) {
		this.#keys = keys
	}
}
