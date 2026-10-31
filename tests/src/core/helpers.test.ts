import type { GridFilter, GridOrder, GridRow, GridSchema } from '@src/core'
import {
	COLUMN_LIMIT,
	admitsFilter,
	auditGrid,
	compareCells,
	computeKeys,
	extractColumn,
	extractGridKey,
	filterGridRows,
	matchesCell,
	matchesFilter,
	matchesTerms,
	matchesGridRow,
	mergeTerms,
	removeTerms,
	serializeRows,
	serializeGrid,
	sortGridRows,
} from '@src/core'
import {
	matchDirection,
	compareCellsReverse as reverseComparator,
	createChoiceBudgetSchema,
	createColumnBudgetSchema,
	createNodeBudgetSchema,
	createGridRows,
	createGridSchema,
	createTextBudgetSchema,
} from '../../setup.js'
import { describe, expect, it } from 'vitest'
import {
	CHOICE_LIMIT,
	NAME_LIMIT,
	NODE_LIMIT,
	STRING_LIMIT,
	TEXT_LIMIT,
	isUndefined as absentMatcher,
} from '@orkestrel/contract'

it('compares complete row values without relying on snapshot identity or property order', () => {
	expect(matchesGridRow({ id: 'ash', name: 'Ash' }, { name: 'Ash', id: 'ash' })).toBe(true)
	expect(matchesGridRow({ id: 'ash', name: 'Ash' }, { id: 'ash' })).toBe(false)
	expect(matchesGridRow({ id: 'ash' }, { id: 'elm' })).toBe(false)
	expect(matchesGridRow(undefined, { id: 'ash' })).toBe(false)
	expect(matchesGridRow({ id: 'ash', active: false }, { id: 'ash', active: true })).toBe(false)
})
describe('grid helper leaves', () => {
	it('extracts declared columns and only usable row identities', () => {
		const schema = createGridSchema()

		expect(extractColumn(schema, 'age')).toEqual({
			cell: 'number',
			key: 'age',
			label: 'Age',
			meta: { align: 'end' },
		})
		expect(extractColumn(schema, 'missing')).toBeUndefined()
		expect(extractGridKey(schema, { id: '7' })).toBe('7')
		expect(extractGridKey(schema, { id: '' })).toBeUndefined()
		expect(extractGridKey(schema, { id: 7 })).toBeUndefined()
		expect(extractGridKey(schema, { name: 'Ada' })).toBeUndefined()
	})

	it('matches each cell variant and enforces the string boundary before choice lookup', () => {
		const schema = createGridSchema()
		const text = extractColumn(schema, 'name')
		const number = extractColumn(schema, 'age')
		const flag = extractColumn(schema, 'active')
		const choice = extractColumn(schema, 'status')
		if (text === undefined || number === undefined || flag === undefined || choice === undefined) {
			throw new Error('Expected fixture columns')
		}

		expect(matchesCell(text, 'x'.repeat(STRING_LIMIT))).toBe(true)
		expect(matchesCell(text, 'x'.repeat(STRING_LIMIT + 1))).toBe(false)
		expect(matchesCell(number, -0)).toBe(true)
		expect(matchesCell(number, Number.NaN)).toBe(false)
		expect(matchesCell(number, Number.POSITIVE_INFINITY)).toBe(false)
		expect(matchesCell(flag, false)).toBe(true)
		expect(matchesCell(flag, 0)).toBe(false)
		expect(matchesCell(choice, 'live')).toBe(true)
		expect(matchesCell(choice, 'missing')).toBe(false)
	})

	it('compares absence and every present cell variant in ascending order', () => {
		const schema = createGridSchema()
		const text = extractColumn(schema, 'name')
		const number = extractColumn(schema, 'age')
		const flag = extractColumn(schema, 'active')
		const choice = extractColumn(schema, 'status')
		if (text === undefined || number === undefined || flag === undefined || choice === undefined) {
			throw new Error('Expected fixture columns')
		}

		expect(compareCells(text, undefined, 'Ada')).toBeLessThan(0)
		expect(compareCells(text, undefined, undefined)).toBe(0)
		expect(compareCells(text, 'Ada', 'Grace')).toBeLessThan(0)
		expect(compareCells(number, 45, 36)).toBeGreaterThan(0)
		expect(compareCells(flag, false, true)).toBeLessThan(0)
		expect(compareCells(choice, 'draft', 'live')).toBeLessThan(0)
		expect(compareCells(choice, 'archived', 'live')).toBeGreaterThan(0)
	})

	it('applies the complete operator by cell-variant matrix', () => {
		const schema = createGridSchema()
		const text = extractColumn(schema, 'name')
		const number = extractColumn(schema, 'age')
		const flag = extractColumn(schema, 'active')
		const choice = extractColumn(schema, 'status')
		if (text === undefined || number === undefined || flag === undefined || choice === undefined) {
			throw new Error('Expected fixture columns')
		}

		expect(
			matchesFilter(text, 'Grace', { column: 'name', operator: 'contains', text: 'ace' }),
		).toBe(true)
		expect(admitsFilter(text, { column: 'name', operator: 'contains', text: 'ace' })).toBe(true)
		expect(admitsFilter(number, { column: 'age', operator: 'contains', text: '4' })).toBe(false)
		expect(
			admitsFilter(text, { column: 'name', operator: 'contains', text: 'a'.repeat(STRING_LIMIT) }),
		).toBe(true)
		expect(
			admitsFilter(text, {
				column: 'name',
				operator: 'contains',
				text: 'a'.repeat(STRING_LIMIT + 1),
			}),
		).toBe(false)
		expect(
			admitsFilter(flag, {
				column: 'active',
				operator: 'between',
				minimum: 0,
				maximum: 1,
			}),
		).toBe(false)
		expect(
			matchesFilter(text, '2026-03-14', {
				column: 'name',
				operator: 'between',
				minimum: '2026-01-01',
				maximum: '2026-06-30',
			}),
		).toBe(true)
		expect(matchesFilter(text, 'Ada', { column: 'name', operator: 'equals', value: 'Ada' })).toBe(
			true,
		)
		expect(
			matchesFilter(number, 40, {
				column: 'age',
				operator: 'between',
				minimum: 36,
				maximum: 40,
			}),
		).toBe(true)
		expect(matchesFilter(number, 40, { column: 'age', operator: 'equals', value: 40 })).toBe(true)
		expect(matchesFilter(flag, false, { column: 'active', operator: 'equals', value: false })).toBe(
			true,
		)
		expect(
			matchesFilter(choice, 'archived', {
				column: 'status',
				operator: 'contains',
				text: 'chiv',
			}),
		).toBe(true)
		expect(
			matchesFilter(choice, 'live', { column: 'status', operator: 'equals', value: 'live' }),
		).toBe(true)
		expect(matchesFilter(number, 40, { column: 'age', operator: 'contains', text: '4' })).toBe(
			false,
		)
		expect(
			matchesFilter(flag, false, {
				column: 'active',
				operator: 'between',
				minimum: 0,
				maximum: 1,
			}),
		).toBe(false)
		expect(matchesFilter(text, undefined, { column: 'name', operator: 'equals', value: '' })).toBe(
			false,
		)
	})

	it('filters with and-only composition and replaces one declared column matcher', () => {
		const schema = createGridSchema()
		const rows = createGridRows()
		const filtered = filterGridRows(schema, rows, [
			{ column: 'name', operator: 'contains', text: 'a' },
			{ column: 'age', operator: 'between', minimum: 40, maximum: 50 },
		])
		const absent = filterGridRows(schema, rows, [{ column: 'age', operator: 'equals', value: 0 }], {
			age: absentMatcher,
		})

		expect(filtered.map((row) => row.id)).toStrictEqual(['2', '3'])
		expect(absent.map((row) => row.id)).toStrictEqual(['4'])
		expect(Object.isFrozen(filtered)).toBe(true)
	})

	it('computes atomic 0/1/N key-set changes and preserves no-op identity', () => {
		const known = ['1', '2']
		const current: ReadonlySet<string> = new Set(['1'])
		const added = computeKeys(known, current, '2', () => true)
		const toggled = computeKeys(known, current, ['1', '1'], (included) => !included)
		const cleared = computeKeys(known, current, undefined, () => false)

		expect(added === undefined ? [] : [...added]).toStrictEqual(['1', '2'])
		expect(computeKeys(known, current, ['missing'], () => true)).toBeUndefined()
		expect(computeKeys(known, current, '1', () => true)).toBe(current)
		expect(toggled).toBe(current)
		expect(cleared === undefined ? [] : [...cleared]).toStrictEqual([])
	})

	it('merges lens terms by column, keeping first-appearance order and owning each entry', () => {
		const current: readonly GridOrder[] = [
			{ column: 'name', direction: 'ascending' },
			{ column: 'age', direction: 'ascending' },
		]
		const merged = mergeTerms(current, [
			{ column: 'age', direction: 'descending' },
			{ column: 'active', direction: 'ascending' },
		])

		expect(merged.map((order) => order.column)).toStrictEqual(['name', 'age', 'active'])
		expect(merged.map((order) => order.direction)).toStrictEqual([
			'ascending',
			'descending',
			'ascending',
		])
		expect(Object.isFrozen(merged)).toBe(true)
		expect(Object.isFrozen(merged[1])).toBe(true)
		expect(Object.isFrozen(merged[2])).toBe(true)
		expect(merged[0]).toBe(current[0])
		expect(current.map((order) => order.direction)).toStrictEqual(['ascending', 'ascending'])
		expect(mergeTerms(current, []).map((order) => order.column)).toStrictEqual(['name', 'age'])
	})

	it('removes lens terms by column and leaves the rest in order', () => {
		const current: readonly GridFilter[] = [
			{ column: 'name', operator: 'contains', text: 'a' },
			{ column: 'age', operator: 'between', minimum: 1, maximum: 2 },
			{ column: 'active', operator: 'equals', value: true },
		]
		const remaining = removeTerms(current, ['age', 'missing'])

		expect(remaining.map((filter) => filter.column)).toStrictEqual(['name', 'active'])
		expect(Object.isFrozen(remaining)).toBe(true)
		expect(removeTerms(current, []).length).toBe(3)
		expect(removeTerms(current, ['name', 'age', 'active']).length).toBe(0)
	})

	it('matches two lens lists on length, column order, and the supplied operand test', () => {
		const left: readonly GridOrder[] = [
			{ column: 'name', direction: 'ascending' },
			{ column: 'age', direction: 'descending' },
		]
		expect(matchesTerms(left, [...left], matchDirection)).toBe(true)
		expect(matchesTerms(left, left.slice(0, 1), matchDirection)).toBe(false)
		expect(
			matchesTerms(
				left,
				[
					{ column: 'age', direction: 'descending' },
					{ column: 'name', direction: 'ascending' },
				],
				matchDirection,
			),
		).toBe(false)
		expect(
			matchesTerms(
				left,
				[
					{ column: 'name', direction: 'ascending' },
					{ column: 'age', direction: 'ascending' },
				],
				matchDirection,
			),
		).toBe(false)
		expect(matchesTerms([], [], matchDirection)).toBe(true)
	})

	it('sorts by ordered terms stably with absence and direction applied last', () => {
		const schema = createGridSchema()
		const rows: readonly GridRow[] = [
			{ id: '1', status: 'live', age: 40 },
			{ id: '2', status: 'draft', age: 30 },
			{ id: '3', status: 'live', age: 40 },
			{ id: '4', status: 'live' },
		]
		const sorted = sortGridRows(schema, rows, [
			{ column: 'status', direction: 'ascending' },
			{ column: 'age', direction: 'descending' },
		])

		expect(sorted.map((row) => row.id)).toStrictEqual(['2', '1', '3', '4'])
		expect(rows.map((row) => row.id)).toStrictEqual(['1', '2', '3', '4'])
		expect(Object.isFrozen(sorted)).toBe(true)
	})

	it('replaces only the named comparator and preserves stable ties', () => {
		const schema = createGridSchema()
		const rows: readonly GridRow[] = [
			{ id: '1', name: 'A2' },
			{ id: '2', name: 'A10' },
			{ id: '3', name: 'A2' },
		]
		const sorted = sortGridRows(schema, rows, [{ column: 'name', direction: 'ascending' }], {
			name: reverseComparator,
		})

		expect(sorted.map((row) => row.id)).toStrictEqual(['1', '3', '2'])
	})

	it('reports every domain fault with stable lowercase diagnostics', () => {
		const faults: ReadonlyArray<[GridSchema, string]> = [
			[
				{ key: 'missing', columns: [{ cell: 'text', key: 'id' }] },
				'schema key "missing" names no declared column',
			],
			[
				{ key: 'age', columns: [{ cell: 'number', key: 'age' }] },
				'schema key "age" names a number column, which holds no identity',
			],
			[
				{
					key: 'id',
					columns: [
						{ cell: 'text', key: 'id' },
						{ cell: 'text', key: 'id' },
					],
				},
				'column "id" is declared more than once',
			],
			[{ key: '', columns: [{ cell: 'text', key: '' }] }, 'column "" has an empty key'],
			[
				{
					key: 'id',
					columns: [
						{ cell: 'text', key: 'id' },
						{
							cell: 'choice',
							key: 'status',
							choices: [
								{ value: 'live', label: 'Live' },
								{ value: 'live', label: 'Published' },
							],
						},
					],
				},
				'column "status" offers choice "live" more than once',
			],
			[
				{
					key: 'id',
					columns: [
						{ cell: 'text', key: 'id' },
						{ cell: 'choice', key: 'status', choices: [] },
					],
				},
				'column "status" offers no choices',
			],
		]

		for (const [schema, fault] of faults) expect(auditGrid(schema)).toContain(fault)
	})

	it('accepts exact cardinality and name budgets then reports one-step breaches', () => {
		expect(auditGrid(createColumnBudgetSchema(COLUMN_LIMIT))).not.toContain(
			`schema declares more than ${COLUMN_LIMIT} columns`,
		)
		expect(auditGrid(createColumnBudgetSchema(COLUMN_LIMIT + 1))).toContain(
			`schema declares more than ${COLUMN_LIMIT} columns`,
		)
		expect(auditGrid(createChoiceBudgetSchema(CHOICE_LIMIT))).not.toContain(
			`column "status" offers more than ${CHOICE_LIMIT} choices`,
		)
		expect(auditGrid(createChoiceBudgetSchema(CHOICE_LIMIT + 1))).toContain(
			`column "status" offers more than ${CHOICE_LIMIT} choices`,
		)
		expect(
			auditGrid({
				key: 'i'.repeat(NAME_LIMIT),
				columns: [{ cell: 'text', key: 'i'.repeat(NAME_LIMIT) }],
			}),
		).not.toContain(`schema contains a name longer than ${NAME_LIMIT}`)
		expect(
			auditGrid({
				key: 'i'.repeat(NAME_LIMIT + 1),
				columns: [{ cell: 'text', key: 'i'.repeat(NAME_LIMIT + 1) }],
			}),
		).toContain(`schema contains a name longer than ${NAME_LIMIT}`)
	})

	it('accepts exact string, text, and node budgets then reports one-step breaches', () => {
		const exactString = {
			key: 'id',
			columns: [{ cell: 'text', key: 'id', label: 'x'.repeat(STRING_LIMIT) }],
		} satisfies GridSchema
		const longString = {
			key: 'id',
			columns: [{ cell: 'text', key: 'id', label: 'x'.repeat(STRING_LIMIT + 1) }],
		} satisfies GridSchema

		expect(auditGrid(exactString)).not.toContain(
			`schema contains a string longer than ${STRING_LIMIT}`,
		)
		expect(auditGrid(longString)).toContain(`schema contains a string longer than ${STRING_LIMIT}`)
		expect(auditGrid(createTextBudgetSchema())).not.toContain(
			`schema retains more than ${TEXT_LIMIT} string code units`,
		)
		expect(auditGrid(createTextBudgetSchema(1))).toContain(
			`schema retains more than ${TEXT_LIMIT} string code units`,
		)
		expect(auditGrid(createNodeBudgetSchema())).not.toContain(
			`schema retains more than ${NODE_LIMIT} nodes`,
		)
		expect(auditGrid(createNodeBudgetSchema(1))).toContain(
			`schema retains more than ${NODE_LIMIT} nodes`,
		)
	})

	it('serializes schema declarations and row cells in fixed order without absent values', () => {
		const schema = createGridSchema()
		const serialized = serializeGrid(schema)
		const rows = serializeRows(schema, [{ age: 36, id: '1', unknown: 'drop' }])
		const columns = serialized.columns
		const first = Array.isArray(columns) ? columns[0] : undefined

		expect(Object.keys(serialized)).toStrictEqual(['name', 'label', 'help', 'key', 'columns'])
		expect(typeof first === 'object' && first !== null ? Object.keys(first) : []).toStrictEqual([
			'cell',
			'key',
			'label',
		])
		expect(Object.keys(rows[0] ?? {})).toStrictEqual(['id', 'age'])
		expect(rows).toEqual([{ id: '1', age: 36 }])
		expect(Object.isFrozen(serialized)).toBe(true)
		expect(Object.isFrozen(rows[0])).toBe(true)
	})
})
