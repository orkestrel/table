import type { JSONRecord } from '@orkestrel/contract'
import type { GridEventMap, GridSchema, TextColumn } from '@src/core'
import {
	isStructuralGridSchema,
	createGrid,
	parseRows,
	parseGrid,
	serializeRows,
	serializeGrid,
	Grid,
} from '@src/core'
import { ExpansionManager } from '../../../src/core/grids/ExpansionManager.js'
import { FilterManager } from '../../../src/core/grids/FilterManager.js'
import { PaginationManager } from '../../../src/core/grids/PaginationManager.js'
import { RowManager } from '../../../src/core/grids/RowManager.js'
import { SelectionManager } from '../../../src/core/grids/SelectionManager.js'
import { SortManager } from '../../../src/core/grids/SortManager.js'
import { createRecorder, requireValue } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	createGridFixture,
	createDeepMetadata,
	TestMetadata,
	createGridRows,
	createGridSchema,
	readDestroyedWrites,
	readGridError,
} from '../../setup.js'

describe('Grid construction and derived state', () => {
	it('exposes each interface member set exactly', () => {
		expect(Object.getOwnPropertyNames(Grid.prototype).sort()).toStrictEqual(
			[
				'clear',
				'constructor',
				'count',
				'destroy',
				'destroyed',
				'emitter',
				'expansion',
				'filter',
				'pagination',
				'rows',
				'schema',
				'selection',
				'sort',
				'view',
			].sort(),
		)
		expect(Object.getOwnPropertyNames(RowManager.prototype).sort()).toStrictEqual(
			['add', 'constructor', 'move', 'remove', 'replace', 'row', 'rows', 'update'].sort(),
		)
		expect(Object.getOwnPropertyNames(SortManager.prototype).sort()).toStrictEqual(
			['constructor', 'order', 'orders', 'remove', 'set'].sort(),
		)
		expect(Object.getOwnPropertyNames(FilterManager.prototype).sort()).toStrictEqual(
			['constructor', 'filter', 'filters', 'remove', 'set'].sort(),
		)
		expect(Object.getOwnPropertyNames(SelectionManager.prototype).sort()).toStrictEqual(
			['clear', 'constructor', 'keys', 'select', 'toggle'].sort(),
		)
		expect(Object.getOwnPropertyNames(ExpansionManager.prototype).sort()).toStrictEqual(
			['clear', 'constructor', 'expand', 'keys', 'toggle'].sort(),
		)
		expect(Object.getOwnPropertyNames(PaginationManager.prototype).sort()).toStrictEqual(
			['constructor', 'count', 'limit', 'move', 'offset', 'page', 'resize'].sort(),
		)
	})

	it('refuses a schema whose owned copy fails the guard the caller-supplied one passed', () => {
		const deep = createDeepMetadata(600)
		// The trap answers a property read; the clone reads the data descriptor instead, so the
		// object the guard accepted and the object the grid would own are not the same schema.
		const meta: JSONRecord = new Proxy(
			{ align: deep },
			{
				get(holder, key, receiver) {
					return key === 'align' ? 'end' : Reflect.get(holder, key, receiver)
				},
			},
		)
		const schema: GridSchema = { key: 'id', columns: [{ cell: 'text', key: 'id', meta }] }

		expect(isStructuralGridSchema(schema)).toBe(true)
		expect(readGridError(() => new Grid(schema))).toBe('SCHEMA')
	})

	it('reaches the constructor SCHEMA refusal when meta answers the guard and the clone differently', () => {
		// Measured: the guard reads `meta` once (isStructuralGridSchema), the constructor's own
		// re-guard reads it once more, and cloneGridSchema's undefined check reads it a third time
		// before cloneGridSchema's cloneJSONRecord call issues the fourth read that fails.
		const stable = 3
		const metadata = new TestMetadata(stable)
		const column: TextColumn = { cell: 'text', key: 'id' }
		Object.defineProperty(column, 'meta', {
			enumerable: true,
			configurable: true,
			get() {
				return metadata.read()
			},
		})
		const schema: GridSchema = { key: 'id', columns: [column] }

		expect(isStructuralGridSchema(schema)).toBe(true)
		expect(metadata.calls).toBe(1)
		expect(() => new Grid(schema)).toThrow(/^column "id" has metadata that cannot be owned$/)
	})

	it('owns the schema and seeded rows while opening without events', () => {
		const schema = createGridSchema()
		const rows = [...createGridRows()]
		const writes = createRecorder<GridEventMap['write']>()
		const grid = new Grid(schema, { rows, on: { write: writes.handler } })

		rows[0] = { id: 'changed' }
		const first = grid.rows.row('1')
		const changed = first === undefined ? false : Reflect.set(first, 'name', 'Changed')

		expect(grid.schema).not.toBe(schema)
		expect(Object.isFrozen(grid.schema)).toBe(true)
		expect(changed).toBe(false)
		expect(grid.rows.row('1')?.name).toBe('Ada')
		expect(writes.count).toBe(0)
	})

	it('derives view as filter then sort then page and count before paging', () => {
		const grid = createGridFixture({ rows: createGridRows(), limit: 2 })

		grid.filter.set({ column: 'active', operator: 'equals', value: true })
		grid.sort.set({ column: 'age', direction: 'descending' })

		expect(grid.count).toBe(2)
		expect(grid.view.map((row) => row.id)).toStrictEqual(['3', '1'])
		expect(grid.pagination.count).toBe(1)
	})

	it('hands out a fresh frozen row snapshot on every view read', () => {
		const grid = createGridFixture({ limit: 2 })
		const first = grid.view
		const second = grid.view

		expect(first).not.toBe(second)
		expect(first[0]).not.toBe(second[0])
		expect(Object.isFrozen(first)).toBe(true)
		expect(first.every((row) => Object.isFrozen(row))).toBe(true)
	})
})

describe('Grid events and lifecycle', () => {
	it('drives the assembled grid workflow through every manager and wire boundary', () => {
		const schemaWire = JSON.stringify(serializeGrid(createGridSchema()))
		const schema = requireValue(parseGrid(JSON.parse(schemaWire)))
		const grid = createGrid(schema, { limit: 2 })
		const events: string[] = []
		grid.emitter.on('write', (key) => events.push(`write:${key}`))
		grid.emitter.on('remove', (key) => events.push(`remove:${key}`))
		grid.emitter.on('sort', (orders) => events.push(`sort:${orders.length}`))
		grid.emitter.on('filter', (filters) => events.push(`filter:${filters.length}`))
		grid.emitter.on('select', (keys) => events.push(`select:${keys.size}`))
		grid.emitter.on('expand', (keys) => events.push(`expand:${keys.size}`))
		grid.emitter.on('paginate', (page) => events.push(`paginate:${page}`))
		grid.emitter.on('clear', () => events.push('clear'))

		grid.rows.add([
			...createGridRows(),
			{ id: '5', name: 'Bea', age: 31, active: true, status: 'draft' },
			{ id: '6', name: 'Zoe', age: 28, active: true, status: 'live' },
		])
		grid.sort.set({ column: 'age', direction: 'descending' })
		grid.filter.set({ column: 'active', operator: 'equals', value: true })
		grid.pagination.move(2)
		expect(grid.view.map((row) => row.id)).toStrictEqual(['5', '6'])

		grid.selection.select(['5', '6'])
		grid.expansion.expand(['5', '6'])
		expect(grid.rows.update({ id: '5', age: 32 })).toBe(true)
		expect(grid.rows.move('6', 0)).toBe(true)
		expect(grid.sort.remove('age')).toBe(true)
		grid.sort.set({ column: 'age', direction: 'descending' })
		expect(grid.filter.remove('active')).toBe(true)
		grid.filter.set({ column: 'active', operator: 'equals', value: true })

		expect(grid.selection.toggle('5')).toBe(true)
		expect(grid.selection.toggle('5')).toBe(true)
		expect(grid.selection.clear('5')).toBe(true)
		expect(grid.selection.select('5')).toBe(true)
		expect(grid.expansion.toggle('5')).toBe(true)
		expect(grid.expansion.toggle('5')).toBe(true)
		expect(grid.expansion.clear('5')).toBe(true)
		expect(grid.expansion.expand('5')).toBe(true)
		grid.pagination.resize(1)
		grid.pagination.resize(2)
		grid.pagination.move(2)

		events.length = 0
		expect(grid.rows.remove(['6', '5'])).toBe(true)
		expect(events).toStrictEqual(['remove:6', 'remove:5', 'select:0', 'expand:0', 'paginate:1'])

		const rowWire = JSON.stringify(serializeRows(schema, grid.view))
		const received = requireValue(parseRows(schema, JSON.parse(rowWire)))
		expect(JSON.stringify(serializeRows(schema, received))).toBe(rowWire)

		events.length = 0
		grid.clear()
		expect(events).toStrictEqual(['clear'])
		expect(grid.rows.rows()).toStrictEqual([])

		grid.destroy()
		grid.destroy()
		expect(grid.destroyed).toBe(true)
		expect(readDestroyedWrites(grid)).toStrictEqual(Array.from({ length: 17 }, () => 'DESTROYED'))
	})

	it('announces removed rows before selection, expansion, and pagination pruning', () => {
		const grid = createGridFixture({
			rows: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
			limit: 2,
		})
		const events: string[] = []
		grid.selection.select(['4', '5'])
		grid.expansion.expand(['4', '5'])
		grid.pagination.move(3)
		grid.emitter.on('remove', (key) =>
			events.push(`remove:${key}:${grid.rows.row(key) === undefined}:${grid.pagination.page}`),
		)
		grid.emitter.on('select', (keys) =>
			events.push(`select:${keys.size}:${grid.selection.keys.size}:${grid.pagination.page}`),
		)
		grid.emitter.on('expand', (keys) =>
			events.push(`expand:${keys.size}:${grid.expansion.keys.size}:${grid.pagination.page}`),
		)
		grid.emitter.on('paginate', (page) => events.push(`paginate:${page}:${grid.pagination.page}`))

		grid.rows.remove(['4', '5'])

		expect(events).toStrictEqual([
			'remove:4:true:2',
			'remove:5:true:2',
			'select:0:0:2',
			'expand:0:0:2',
			'paginate:2:2',
		])
	})

	it('commits an update-driven page clamp before announcing the write', () => {
		const grid = createGridFixture({
			rows: [
				{ id: '1', active: true },
				{ id: '2', active: true },
				{ id: '3', active: true },
				{ id: '4', active: true },
				{ id: '5', active: true },
			],
			limit: 2,
		})
		const events: string[] = []
		grid.filter.set({ column: 'active', operator: 'equals', value: true })
		grid.pagination.move(3)
		grid.emitter.on('write', (key) => events.push(`write:${key}:${grid.pagination.page}`))
		grid.emitter.on('paginate', (page) => events.push(`paginate:${page}:${grid.pagination.page}`))

		grid.rows.update({ id: '5', active: false })

		expect(events).toStrictEqual(['write:5:2', 'paginate:2:2'])
	})

	it('clears every moving axis with one announcement', () => {
		const grid = createGridFixture({ limit: 2 })
		const events: string[] = []
		grid.sort.set({ column: 'name', direction: 'ascending' })
		grid.filter.set({ column: 'name', operator: 'contains', text: 'a' })
		grid.selection.select('1')
		grid.expansion.expand('1')
		grid.pagination.resize(1)
		grid.emitter.on('remove', () => events.push('remove'))
		grid.emitter.on('sort', () => events.push('sort'))
		grid.emitter.on('filter', () => events.push('filter'))
		grid.emitter.on('select', () => events.push('select'))
		grid.emitter.on('expand', () => events.push('expand'))
		grid.emitter.on('paginate', () => events.push('paginate'))
		grid.emitter.on('clear', () => events.push('clear'))

		grid.clear()

		expect(grid.rows.rows()).toStrictEqual([])
		expect(grid.sort.orders()).toStrictEqual([])
		expect(grid.filter.filters()).toStrictEqual([])
		expect(grid.selection.keys.size).toBe(0)
		expect(grid.expansion.keys.size).toBe(0)
		expect(grid.pagination.page).toBe(1)
		expect(grid.pagination.limit).toBe(2)
		expect(events).toStrictEqual(['clear'])
	})

	it('destroys idempotently, keeps getters readable, and refuses every write', () => {
		const grid = createGridFixture({ limit: 2 })
		const before = grid.view

		grid.destroy()
		grid.destroy()

		expect(grid.destroyed).toBe(true)
		expect(grid.view).toStrictEqual(before)
		expect(grid.emitter.destroyed).toBe(true)
		expect(readDestroyedWrites(grid)).toStrictEqual(Array.from({ length: 17 }, () => 'DESTROYED'))
	})

	it('isolates a throwing listener and reports it without stopping siblings', () => {
		const failures: Array<readonly [unknown, string]> = []
		const heard: string[] = []
		const grid = createGridFixture({
			error: (error, event) => failures.push([error, event]),
			on: {
				write: () => {
					throw new Error('listener exploded')
				},
			},
		})
		grid.emitter.on('write', (key) => heard.push(key))

		grid.rows.add({ id: '5', name: 'Katherine', age: 37, active: true, status: 'draft' })

		expect(failures.map((entry) => entry[1])).toStrictEqual(['write'])
		expect(heard).toStrictEqual(['5'])
		expect(grid.rows.row('5')?.name).toBe('Katherine')
	})

	it('refuses malformed and unsound schemas with SCHEMA', () => {
		const malformed: GridSchema = {
			key: 'missing',
			columns: [{ cell: 'text', key: 'id' }],
		}

		expect(readGridError(() => new Grid(malformed))).toBe('SCHEMA')
	})
})
