import {
	STRING_LIMIT,
	auditGrid,
	isGridRow,
	isGridSchema,
	parseRows,
	parseGrid,
	serializeRows,
	serializeGrid,
} from '@src/core'
import {
	createNodeBudgetSchema,
	createAccessorSchema,
	createGridRows,
	createGridSchema,
	createTextBudgetSchema,
} from '../../setup.js'
import { createHostileValues } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'

describe('parseGrid', () => {
	it('returns an owned canonical schema only when structure and domain are sound', () => {
		const meta = { renderer: { tone: 'quiet' } }
		const choices = [{ label: 'Live', value: 'live' }]
		const input = {
			label: 'People',
			key: 'id',
			columns: [
				{ key: 'id', cell: 'text', meta },
				{
					key: 'status',
					cell: 'choice',
					choices,
				},
			],
		}
		const parsed = parseGrid(input)

		meta.renderer.tone = 'loud'
		choices.push({ label: 'Draft', value: 'draft' })

		expect(parsed).toEqual({
			label: 'People',
			key: 'id',
			columns: [
				{ cell: 'text', key: 'id', meta: { renderer: { tone: 'quiet' } } },
				{
					cell: 'choice',
					key: 'status',
					choices: [{ value: 'live', label: 'Live' }],
				},
			],
		})
		expect(isGridSchema(parsed)).toBe(true)
		expect(auditGrid(parsed ?? { key: '', columns: [] })).toStrictEqual([])
		expect(Object.isFrozen(parsed)).toBe(true)
	})

	it('refuses structural and semantic schema faults', () => {
		expect(parseGrid({ columns: [{ cell: 'text', key: 'id' }] })).toBeUndefined()
		expect(parseGrid({ key: 'id', columns: 'not a list' })).toBeUndefined()
		expect(parseGrid({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] })).toBeUndefined()
		expect(parseGrid({ key: 'id', columns: [{ cell: 'choice', key: 'id', choices: [] }] })).toBe(
			undefined,
		)
		expect(
			parseGrid({
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'text', key: 'id' },
				],
			}),
		).toBeUndefined()
	})

	it('never throws for cyclic, hostile, or accessor-bearing wire data', () => {
		const accessor = createAccessorSchema()

		for (const [index, value] of createHostileValues().entries()) {
			expect(() => parseGrid(value), `hostile value ${index}`).not.toThrow()
			expect(parseGrid(value), `hostile value ${index}`).toBeUndefined()
		}
		expect(() => parseGrid(accessor)).not.toThrow()
		expect(parseGrid(accessor)).toBeUndefined()
	})

	it('accepts exact retained budgets and refuses their one-step breaches', () => {
		expect(parseGrid(createTextBudgetSchema())).toBeDefined()
		expect(parseGrid(createTextBudgetSchema(1))).toBeUndefined()
		expect(parseGrid(createNodeBudgetSchema())).toBeDefined()
		expect(parseGrid(createNodeBudgetSchema(1))).toBeUndefined()
	})
})

describe('parseRows', () => {
	it('accepts typed cells and performs only number and flag lexical coercions', () => {
		const schema = createGridSchema()
		const parsed = parseRows(schema, [
			{ id: '1', name: 'Ada', age: ' 36 ', active: 'true', status: 'live' },
			{ id: '2', age: 45, active: false, status: 'draft' },
		])

		expect(parsed).toEqual([
			{ id: '1', name: 'Ada', age: 36, active: true, status: 'live' },
			{ id: '2', age: 45, active: false, status: 'draft' },
		])
		expect(parsed?.every((row) => isGridRow(row) && Object.isFrozen(row))).toBe(true)
		expect(Object.isFrozen(parsed)).toBe(true)
		expect(parseRows(schema, [{ id: 1 }])).toBeUndefined()
		expect(parseRows(schema, [{ id: '1', name: 7 }])).toBeUndefined()
		expect(parseRows(schema, [{ id: '1', age: '' }])).toBeUndefined()
		expect(parseRows(schema, [{ id: '1', active: '1' }])).toBeUndefined()
		expect(parseRows(schema, [{ id: '1', status: 'missing' }])).toBeUndefined()
	})

	it('refuses the whole payload for missing, repeated, unknown, or symbol identity doors', () => {
		const schema = createGridSchema()
		const symbol = { id: '1' }
		Object.defineProperty(symbol, Symbol('hidden'), { value: true, enumerable: true })

		expect(parseRows(schema, [{ name: 'Ada' }])).toBeUndefined()
		expect(parseRows(schema, [{ id: '' }])).toBeUndefined()
		expect(parseRows(schema, [{ id: '1' }, { id: '1' }])).toBeUndefined()
		expect(parseRows(schema, [{ id: '1', unknown: true }])).toBeUndefined()
		expect(parseRows(schema, [symbol])).toBeUndefined()
		expect(parseRows(schema, [{ id: '1' }, { id: '2', age: 'bad' }])).toBeUndefined()
	})

	it('enforces the exact string boundary before parsing or matching', () => {
		const schema = createGridSchema()
		const exact = '1'.padStart(STRING_LIMIT, '0')
		const oversized = '1'.padStart(STRING_LIMIT + 1, '0')

		expect(parseRows(schema, [{ id: '1', name: 'x'.repeat(STRING_LIMIT) }])).toBeDefined()
		expect(parseRows(schema, [{ id: '1', name: 'x'.repeat(STRING_LIMIT + 1) }])).toBeUndefined()
		expect(parseRows(schema, [{ id: '1', age: exact }])).toBeDefined()
		expect(parseRows(schema, [{ id: '1', age: oversized }])).toBeUndefined()
	})

	it('never throws for sparse arrays, hostile rows, or hostile row lists', () => {
		const schema = createGridSchema()
		const sparse = Array(1)
		const hostileRow = new Proxy(
			{ id: '1' },
			{
				ownKeys: () => {
					throw new Error('hostile row')
				},
			},
		)
		const hostileRows = new Proxy([], {
			get: () => {
				throw new Error('hostile list')
			},
		})

		for (const input of [sparse, [hostileRow], hostileRows]) {
			expect(() => parseRows(schema, input)).not.toThrow()
			expect(parseRows(schema, input)).toBeUndefined()
		}
	})
})

describe('wire round trips', () => {
	it('reproduces canonical schema and row bytes exactly', () => {
		const schema = createGridSchema()
		const rows = createGridRows()
		const schemaWire = JSON.stringify(serializeGrid(schema))
		const rowWire = JSON.stringify(serializeRows(schema, rows))
		const parsedSchema = parseGrid(JSON.parse(schemaWire))
		const parsedRows = parseRows(schema, JSON.parse(rowWire))

		expect(parsedSchema).toBeDefined()
		expect(parsedRows).toBeDefined()
		expect(JSON.stringify(serializeGrid(parsedSchema ?? schema))).toBe(schemaWire)
		expect(JSON.stringify(serializeRows(schema, parsedRows ?? []))).toBe(rowWire)
	})

	it('owns prototype-looking row and metadata keys without polluting prototypes', () => {
		const schema = parseGrid(
			JSON.parse(
				'{"key":"id","columns":[{"cell":"text","key":"id","meta":{"__proto__":{"safe":true}}},{"cell":"text","key":"__proto__"}]}',
			),
		)
		const rows =
			schema === undefined
				? undefined
				: parseRows(schema, JSON.parse('[{"id":"1","__proto__":"owned"}]'))
		const meta = schema?.columns[0]?.meta
		const row = rows?.[0]

		expect(Object.getPrototypeOf(meta)).toBeNull()
		expect(Object.hasOwn(meta ?? {}, '__proto__')).toBe(true)
		expect(meta?.__proto__).toEqual({ safe: true })
		expect(Object.hasOwn(row ?? {}, '__proto__')).toBe(true)
		expect(row?.__proto__).toBe('owned')
		expect(Object.prototype).not.toHaveProperty('safe')
	})
})
