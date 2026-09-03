import type { JSONRecord } from '@orkestrel/contract'
import type { TableEventMap, TableSchema, TextColumn } from '@src/core'
import {
	isStructuralTableSchema,
	createTable,
	parseRows,
	parseTable,
	serializeRows,
	serializeTable,
	Table,
} from '@src/core'
import { ExpansionManager } from '../../../src/core/tables/ExpansionManager.js'
import { FilterManager } from '../../../src/core/tables/FilterManager.js'
import { PaginationManager } from '../../../src/core/tables/PaginationManager.js'
import { RowManager } from '../../../src/core/tables/RowManager.js'
import { SelectionManager } from '../../../src/core/tables/SelectionManager.js'
import { SortManager } from '../../../src/core/tables/SortManager.js'
import { createRecorder, requireValue } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	createTableFixture,
	createTableRows,
	createTableSchema,
	readDestroyedWrites,
	readTableError,
} from '../../setup.js'

describe('Table construction and derived state', () => {
	it('exposes each interface member set exactly', () => {
		expect(Object.getOwnPropertyNames(Table.prototype).sort()).toStrictEqual(
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
			['add', 'constructor', 'move', 'remove', 'row', 'rows', 'update'].sort(),
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
		const deep: Record<string, JSONRecord> = {}
		let current = deep
		for (let index = 0; index < 600; index += 1) {
			const next: Record<string, JSONRecord> = {}
			current.next = next
			current = next
		}
		// The trap answers a property read; the clone reads the data descriptor instead, so the
		// object the guard accepted and the object the table would own are not the same schema.
		const meta: JSONRecord = new Proxy(
			{ align: deep },
			{
				get(holder, key, receiver) {
					return key === 'align' ? 'end' : Reflect.get(holder, key, receiver)
				},
			},
		)
		const schema: TableSchema = { key: 'id', columns: [{ cell: 'text', key: 'id', meta }] }

		expect(isStructuralTableSchema(schema)).toBe(true)
		expect(readTableError(() => new Table(schema))).toBe('SCHEMA')
	})

	it('reaches the constructor SCHEMA refusal when meta answers the guard and the clone differently', () => {
		// Measured: the guard reads `meta` once (isStructuralTableSchema), the constructor's own
		// re-guard reads it once more, and cloneSchema's undefined check reads it a third time
		// before cloneSchema's cloneJSONRecord call issues the fourth read that fails.
		const stable = 3
		let calls = 0
		const column: TextColumn = { cell: 'text', key: 'id' }
		Object.defineProperty(column, 'meta', {
			enumerable: true,
			configurable: true,
			get() {
				calls += 1
				if (calls <= stable) return { align: 'end' }
				const cyclic: Record<string, unknown> = {}
				cyclic.self = cyclic
				return cyclic
			},
		})
		const schema: TableSchema = { key: 'id', columns: [column] }

		expect(isStructuralTableSchema(schema)).toBe(true)
		expect(calls).toBe(1)
		expect(() => new Table(schema)).toThrow(/^column "id" has metadata that cannot be owned$/)
	})

	it('owns the schema and seeded rows while opening without events', () => {
		const schema = createTableSchema()
		const rows = [...createTableRows()]
		const writes = createRecorder<TableEventMap['write']>()
		const table = new Table(schema, { rows, on: { write: writes.handler } })

		rows[0] = { id: 'changed' }
		const first = table.rows.row('1')
		const changed = first === undefined ? false : Reflect.set(first, 'name', 'Changed')

		expect(table.schema).not.toBe(schema)
		expect(Object.isFrozen(table.schema)).toBe(true)
		expect(changed).toBe(false)
		expect(table.rows.row('1')?.name).toBe('Ada')
		expect(writes.count).toBe(0)
	})

	it('derives view as filter then sort then page and count before paging', () => {
		const table = createTableFixture({ rows: createTableRows(), limit: 2 })

		table.filter.set({ column: 'active', operator: 'equals', value: true })
		table.sort.set({ column: 'age', direction: 'descending' })

		expect(table.count).toBe(2)
		expect(table.view.map((row) => row.id)).toStrictEqual(['3', '1'])
		expect(table.pagination.count).toBe(1)
	})

	it('hands out a fresh frozen row snapshot on every view read', () => {
		const table = createTableFixture({ limit: 2 })
		const first = table.view
		const second = table.view

		expect(first).not.toBe(second)
		expect(first[0]).not.toBe(second[0])
		expect(Object.isFrozen(first)).toBe(true)
		expect(first.every((row) => Object.isFrozen(row))).toBe(true)
	})
})

describe('Table events and lifecycle', () => {
	it('drives the assembled table workflow through every manager and wire boundary', () => {
		const schemaWire = JSON.stringify(serializeTable(createTableSchema()))
		const schema = requireValue(parseTable(JSON.parse(schemaWire)))
		const table = createTable(schema, { limit: 2 })
		const events: string[] = []
		table.emitter.on('write', (key) => events.push(`write:${key}`))
		table.emitter.on('remove', (key) => events.push(`remove:${key}`))
		table.emitter.on('sort', (orders) => events.push(`sort:${orders.length}`))
		table.emitter.on('filter', (filters) => events.push(`filter:${filters.length}`))
		table.emitter.on('select', (keys) => events.push(`select:${keys.size}`))
		table.emitter.on('expand', (keys) => events.push(`expand:${keys.size}`))
		table.emitter.on('paginate', (page) => events.push(`paginate:${page}`))
		table.emitter.on('clear', () => events.push('clear'))

		table.rows.add([
			...createTableRows(),
			{ id: '5', name: 'Bea', age: 31, active: true, status: 'draft' },
			{ id: '6', name: 'Zoe', age: 28, active: true, status: 'live' },
		])
		table.sort.set({ column: 'age', direction: 'descending' })
		table.filter.set({ column: 'active', operator: 'equals', value: true })
		table.pagination.move(2)
		expect(table.view.map((row) => row.id)).toStrictEqual(['5', '6'])

		table.selection.select(['5', '6'])
		table.expansion.expand(['5', '6'])
		expect(table.rows.update({ id: '5', age: 32 })).toBe(true)
		expect(table.rows.move('6', 0)).toBe(true)
		expect(table.sort.remove('age')).toBe(true)
		table.sort.set({ column: 'age', direction: 'descending' })
		expect(table.filter.remove('active')).toBe(true)
		table.filter.set({ column: 'active', operator: 'equals', value: true })

		expect(table.selection.toggle('5')).toBe(true)
		expect(table.selection.toggle('5')).toBe(true)
		expect(table.selection.clear('5')).toBe(true)
		expect(table.selection.select('5')).toBe(true)
		expect(table.expansion.toggle('5')).toBe(true)
		expect(table.expansion.toggle('5')).toBe(true)
		expect(table.expansion.clear('5')).toBe(true)
		expect(table.expansion.expand('5')).toBe(true)
		table.pagination.resize(1)
		table.pagination.resize(2)
		table.pagination.move(2)

		events.length = 0
		expect(table.rows.remove(['6', '5'])).toBe(true)
		expect(events).toStrictEqual(['remove:6', 'remove:5', 'select:0', 'expand:0', 'paginate:1'])

		const rowWire = JSON.stringify(serializeRows(schema, table.view))
		const received = requireValue(parseRows(schema, JSON.parse(rowWire)))
		expect(JSON.stringify(serializeRows(schema, received))).toBe(rowWire)

		events.length = 0
		table.clear()
		expect(events).toStrictEqual(['clear'])
		expect(table.rows.rows()).toStrictEqual([])

		table.destroy()
		table.destroy()
		expect(table.destroyed).toBe(true)
		expect(readDestroyedWrites(table)).toStrictEqual(Array.from({ length: 17 }, () => 'DESTROYED'))
	})

	it('announces removed rows before selection, expansion, and pagination pruning', () => {
		const table = createTableFixture({
			rows: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
			limit: 2,
		})
		const events: string[] = []
		table.selection.select(['4', '5'])
		table.expansion.expand(['4', '5'])
		table.pagination.move(3)
		table.emitter.on('remove', (key) =>
			events.push(`remove:${key}:${table.rows.row(key) === undefined}:${table.pagination.page}`),
		)
		table.emitter.on('select', (keys) =>
			events.push(`select:${keys.size}:${table.selection.keys.size}:${table.pagination.page}`),
		)
		table.emitter.on('expand', (keys) =>
			events.push(`expand:${keys.size}:${table.expansion.keys.size}:${table.pagination.page}`),
		)
		table.emitter.on('paginate', (page) => events.push(`paginate:${page}:${table.pagination.page}`))

		table.rows.remove(['4', '5'])

		expect(events).toStrictEqual([
			'remove:4:true:2',
			'remove:5:true:2',
			'select:0:0:2',
			'expand:0:0:2',
			'paginate:2:2',
		])
	})

	it('commits an update-driven page clamp before announcing the write', () => {
		const table = createTableFixture({
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
		table.filter.set({ column: 'active', operator: 'equals', value: true })
		table.pagination.move(3)
		table.emitter.on('write', (key) => events.push(`write:${key}:${table.pagination.page}`))
		table.emitter.on('paginate', (page) => events.push(`paginate:${page}:${table.pagination.page}`))

		table.rows.update({ id: '5', active: false })

		expect(events).toStrictEqual(['write:5:2', 'paginate:2:2'])
	})

	it('clears every moving axis with one announcement', () => {
		const table = createTableFixture({ limit: 2 })
		const events: string[] = []
		table.sort.set({ column: 'name', direction: 'ascending' })
		table.filter.set({ column: 'name', operator: 'contains', text: 'a' })
		table.selection.select('1')
		table.expansion.expand('1')
		table.pagination.resize(1)
		table.emitter.on('remove', () => events.push('remove'))
		table.emitter.on('sort', () => events.push('sort'))
		table.emitter.on('filter', () => events.push('filter'))
		table.emitter.on('select', () => events.push('select'))
		table.emitter.on('expand', () => events.push('expand'))
		table.emitter.on('paginate', () => events.push('paginate'))
		table.emitter.on('clear', () => events.push('clear'))

		table.clear()

		expect(table.rows.rows()).toStrictEqual([])
		expect(table.sort.orders()).toStrictEqual([])
		expect(table.filter.filters()).toStrictEqual([])
		expect(table.selection.keys.size).toBe(0)
		expect(table.expansion.keys.size).toBe(0)
		expect(table.pagination.page).toBe(1)
		expect(table.pagination.limit).toBe(2)
		expect(events).toStrictEqual(['clear'])
	})

	it('destroys idempotently, keeps getters readable, and refuses every write', () => {
		const table = createTableFixture({ limit: 2 })
		const before = table.view

		table.destroy()
		table.destroy()

		expect(table.destroyed).toBe(true)
		expect(table.view).toStrictEqual(before)
		expect(table.emitter.destroyed).toBe(true)
		expect(readDestroyedWrites(table)).toStrictEqual(Array.from({ length: 17 }, () => 'DESTROYED'))
	})

	it('isolates a throwing listener and reports it without stopping siblings', () => {
		const failures: Array<readonly [unknown, string]> = []
		const heard: string[] = []
		const table = createTableFixture({
			error: (error, event) => failures.push([error, event]),
			on: {
				write: () => {
					throw new Error('listener exploded')
				},
			},
		})
		table.emitter.on('write', (key) => heard.push(key))

		table.rows.add({ id: '5', name: 'Katherine', age: 37, active: true, status: 'draft' })

		expect(failures.map((entry) => entry[1])).toStrictEqual(['write'])
		expect(heard).toStrictEqual(['5'])
		expect(table.rows.row('5')?.name).toBe('Katherine')
	})

	it('refuses malformed and unsound schemas with SCHEMA', () => {
		const malformed: TableSchema = {
			key: 'missing',
			columns: [{ cell: 'text', key: 'id' }],
		}

		expect(readTableError(() => new Table(malformed))).toBe('SCHEMA')
	})
})
