import type { FilterOperator, GridFilter, GridRow } from '@src/core'
import { NODE_LIMIT, STRING_LIMIT, TEXT_LIMIT } from '@orkestrel/contract'
import {
	compareTextByLength,
	compareTextNaturally,
	createChoiceBudgetSchema,
	createColumnBudgetSchema,
	createFilterAdmissibilityVectors,
	createNodeBudgetSchema,
	createGridFixture,
	createGridRows,
	createGridSchema,
	createTextBudgetSchema,
	matchTextLoosely,
	readDestroyedWrites,
	readGridError,
} from './setup.js'
import { describe, expect, it } from 'vitest'

describe('root test setup', () => {
	it('orders text by embedded number where a plain lexical order disagrees', () => {
		const labels: readonly string[] = ['item10', 'item2', 'item1', 'item20']

		expect([...labels].sort(compareTextNaturally)).toStrictEqual([
			'item1',
			'item2',
			'item10',
			'item20',
		])
		expect([...labels].sort()).toStrictEqual(['item1', 'item10', 'item2', 'item20'])
		expect(compareTextNaturally(2, 10)).toBeLessThan(0)
		expect(compareTextNaturally(undefined, '')).toBe(0)
		expect(compareTextNaturally(undefined, 'a')).toBeLessThan(0)
	})

	it('orders text by its length and reads an absent cell as empty text', () => {
		const labels: readonly string[] = ['ccc', 'a', 'bb']

		expect([...labels].sort(compareTextByLength)).toStrictEqual(['a', 'bb', 'ccc'])
		expect(compareTextByLength(1000, 'xx')).toBeGreaterThan(0)
		expect(compareTextByLength(undefined, '')).toBe(0)
		expect(compareTextByLength(undefined, 'a')).toBeLessThan(0)
	})

	it('admits a case-folded substring under contains and refuses every other operator', () => {
		const contains: GridFilter = { column: 'name', operator: 'contains', text: 'aD' }

		expect(matchTextLoosely('Ada', contains)).toBe(true)
		expect(matchTextLoosely('ADA', contains)).toBe(true)
		expect(matchTextLoosely('Grace', contains)).toBe(false)
		expect(matchTextLoosely(undefined, contains)).toBe(false)
		expect(matchTextLoosely(undefined, { column: 'name', operator: 'contains', text: '' })).toBe(
			true,
		)
		expect(matchTextLoosely('Ada', { column: 'name', operator: 'equals', value: 'Ada' })).toBe(
			false,
		)
		expect(
			matchTextLoosely(36, { column: 'age', operator: 'between', minimum: 30, maximum: 40 }),
		).toBe(false)
	})

	it('binds every admissibility vector to a declared column and spans both outcomes per operator', () => {
		const declared = createGridSchema().columns
		const vectors = createFilterAdmissibilityVectors()
		const operators: readonly FilterOperator[] = ['contains', 'between', 'equals']

		expect(vectors).not.toHaveLength(0)
		for (const vector of vectors) {
			expect(vector.column.key).toBe(vector.filter.column)
			expect(declared.find((column) => column.key === vector.column.key)).toStrictEqual(
				vector.column,
			)
		}
		expect(new Set(vectors.map((vector) => vector.column.cell))).toStrictEqual(
			new Set(declared.map((column) => column.cell)),
		)
		for (const operator of operators) {
			const outcomes = vectors
				.filter((vector) => vector.filter.operator === operator)
				.map((vector) => vector.admitted)

			expect(new Set(outcomes)).toStrictEqual(new Set([true, false]))
		}
	})

	it('declares a fresh schema keyed on one of its columns and spanning every cell kind', () => {
		const schema = createGridSchema()
		const keys = schema.columns.map((column) => column.key)
		const choices = schema.columns.flatMap((column) =>
			column.cell === 'choice' ? column.choices : [],
		)

		expect(keys).toContain(schema.key)
		expect(new Set(keys).size).toBe(keys.length)
		expect(new Set(schema.columns.map((column) => column.cell))).toStrictEqual(
			new Set(['text', 'number', 'flag', 'choice']),
		)
		expect(choices).not.toHaveLength(0)
		expect(new Set(choices.map((choice) => choice.value)).size).toBe(choices.length)
		expect(createGridSchema()).not.toBe(schema)
		expect(createGridSchema()).toStrictEqual(schema)
	})

	it('builds fresh rows under declared columns, spanning a complete and an incomplete row', () => {
		const rows = createGridRows()
		const declared = new Set(createGridSchema().columns.map((column) => column.key))
		const identities = rows.map((row) => row.id)

		expect(
			rows.flatMap((row) => Object.keys(row)).filter((key) => !declared.has(key)),
		).toStrictEqual([])
		expect(identities.filter((identity) => identity === undefined)).toStrictEqual([])
		expect(new Set(identities).size).toBe(identities.length)
		expect(rows.filter((row) => Object.keys(row).length === declared.size)).not.toHaveLength(0)
		expect(rows.filter((row) => Object.keys(row).length < declared.size)).not.toHaveLength(0)
		expect(createGridRows()).not.toBe(rows)
		expect(createGridRows()).toStrictEqual(rows)
	})

	it('opens the fixture over the shared schema and rows and forwards caller options', () => {
		const grid = createGridFixture()
		const replacement: readonly GridRow[] = [{ id: '9', name: 'Zoe' }]

		// A grid freezes what it holds, so the comparison against a fresh declaration is structural.
		expect(grid.schema).toEqual(createGridSchema())
		expect(grid.rows.rows()).toEqual(createGridRows())
		expect(grid.view).toHaveLength(createGridRows().length)
		expect(createGridFixture({ rows: replacement }).rows.rows()).toEqual(replacement)
		// An option record without rows keeps the shared population and still reaches the grid.
		expect(createGridFixture({ limit: 2 }).rows.rows()).toEqual(createGridRows())
		expect(createGridFixture({ limit: 2 }).view.map((row) => row.id)).toStrictEqual(['1', '2'])
	})

	it('names a success, a foreign throw, and a grid error code as distinct outcomes', () => {
		const grid = createGridFixture()

		expect(readGridError(() => grid.rows.rows())).toBe('NO_THROW')
		expect(readGridError(() => grid.rows.add({ id: '1' }))).toBe('KEY')
		// A throw this package did not raise names its own outcome, distinct from a success, so a
		// consumer reading `NOT_GRID_ERROR` never mistakes a foreign throw for the absence of one.
		expect(
			readGridError(() => {
				throw new RangeError('raised outside the grid')
			}),
		).toBe('NOT_GRID_ERROR')
	})

	it('drives a currently valid call at every destroyed-write entry', () => {
		const grid = createGridFixture()
		// Every entry must be accepted against a live grid, or a consumer reading `DESTROYED` at
		// that position would be reading an operation refused for some other reason.
		const live = readDestroyedWrites(grid)

		expect(live.filter((code) => code !== 'NO_THROW')).toStrictEqual([])

		grid.destroy()

		expect(readDestroyedWrites(grid)).toHaveLength(live.length)
	})

	it('builds the exact column and choice populations it is asked for', () => {
		const columnSchema = createColumnBudgetSchema(3)
		const choiceSchema = createChoiceBudgetSchema(5)
		const choices = choiceSchema.columns.flatMap((column) =>
			column.cell === 'choice' ? column.choices : [],
		)

		expect(columnSchema.columns).toHaveLength(3)
		expect(columnSchema.columns.at(0)?.key).toBe(columnSchema.key)
		expect(new Set(columnSchema.columns.map((column) => column.key)).size).toBe(
			columnSchema.columns.length,
		)
		expect(createColumnBudgetSchema(1).columns).toHaveLength(1)
		expect(choices).toHaveLength(5)
		expect(choiceSchema.columns.map((column) => column.key)).toContain(choiceSchema.key)
		expect(new Set(choices.map((choice) => choice.value)).size).toBe(choices.length)
	})

	it('chunks the text budget under the string limit and moves it by the requested delta', () => {
		const lengths = Object.values(createTextBudgetSchema().columns.at(0)?.meta ?? {}).map((value) =>
			typeof value === 'string' ? value.length : -1,
		)
		const raised = Object.values(createTextBudgetSchema(1).columns.at(0)?.meta ?? {}).map((value) =>
			typeof value === 'string' ? value.length : -1,
		)
		const total = lengths.reduce((sum, length) => sum + length, 0)

		expect(lengths.filter((length) => length < 0)).toStrictEqual([])
		// Chunked under the single-string limit, so the whole-text fault is the only one raised.
		expect(lengths.filter((length) => length > STRING_LIMIT)).toStrictEqual([])
		expect(total).toBeLessThan(TEXT_LIMIT)
		expect(total).toBeGreaterThan(TEXT_LIMIT - STRING_LIMIT)
		expect(raised.reduce((sum, length) => sum + length, 0)).toBe(total + 1)
	})

	it('holds the node budget under the node limit and moves it by the requested delta', () => {
		const nodes = createNodeBudgetSchema().columns.at(0)?.meta?.nodes
		const raised = createNodeBudgetSchema(1).columns.at(0)?.meta?.nodes

		if (!Array.isArray(nodes) || !Array.isArray(raised)) {
			throw new Error('Expected a node array in the column metadata')
		}
		// The array alone sits under the node limit, so the fault at one more counts the whole schema.
		expect(nodes.length).toBeLessThan(NODE_LIMIT)
		expect(raised.length).toBe(nodes.length + 1)
	})
})
