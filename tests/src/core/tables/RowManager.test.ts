import type { TableEventMap, TableRow } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { createTableFixture, readTableError } from '../../../setup.js'

describe('RowManager reads and writes', () => {
	it('finds rows and returns owned frozen snapshots', () => {
		const table = createTableFixture()
		const first = table.rows.row('1')
		const all = table.rows.rows()

		expect(first).toStrictEqual(all[0])
		expect(first).not.toBe(all[0])
		expect(Object.isFrozen(first)).toBe(true)
		expect(Object.isFrozen(all)).toBe(true)
		expect(table.rows.row('missing')).toBeUndefined()
	})

	it('adds one or many rows and emits each committed key in order', () => {
		const table = createTableFixture({ rows: [] })
		const writes = createRecorder<TableEventMap['write']>()
		table.emitter.on('write', writes.handler)

		table.rows.add({ id: '1', name: 'Ada' })
		table.rows.add([
			{ id: '2', name: 'Grace' },
			{ id: '3', name: 'Alan' },
		])
		table.rows.add([])

		expect(table.rows.rows().map((row) => row.id)).toStrictEqual(['1', '2', '3'])
		expect(writes.calls).toStrictEqual([['1'], ['2'], ['3']])
	})

	it('refuses a duplicate or invalid cell batch atomically', () => {
		const table = createTableFixture({ rows: [] })
		const writes = createRecorder<TableEventMap['write']>()
		table.emitter.on('write', writes.handler)
		const duplicate: readonly TableRow[] = [{ id: '1' }, { id: '1' }]

		expect(readTableError(() => table.rows.add(duplicate))).toBe('KEY')
		expect(readTableError(() => table.rows.add([{ id: '1' }, { id: '2', age: 'old' }]))).toBe(
			'CELL',
		)
		expect(table.rows.rows()).toStrictEqual([])
		expect(writes.count).toBe(0)
	})

	it('merges one or many updates and withholds no-op events', () => {
		const table = createTableFixture()
		const writes = createRecorder<TableEventMap['write']>()
		table.emitter.on('write', writes.handler)

		expect(table.rows.update([])).toBe(true)
		expect(table.rows.update({ id: '1', age: 37 })).toBe(true)
		expect(
			table.rows.update([
				{ id: '2', active: true },
				{ id: '3', name: 'Alan' },
			]),
		).toBe(true)

		expect(table.rows.row('1')).toMatchObject({ id: '1', name: 'Ada', age: 37 })
		expect(writes.calls).toStrictEqual([['1'], ['2']])
	})

	it('returns false and changes nothing when an update key is absent', () => {
		const table = createTableFixture()
		const before = table.rows.rows()

		expect(
			table.rows.update([
				{ id: '1', age: 99 },
				{ id: 'missing', age: 1 },
			]),
		).toBe(false)
		expect(table.rows.rows()).toStrictEqual(before)
	})

	it('validates every update before committing any of them', () => {
		const table = createTableFixture()
		const before = table.rows.rows()

		expect(
			readTableError(() =>
				table.rows.update([
					{ id: '1', age: 99 },
					{ id: '2', age: 'old' },
				]),
			),
		).toBe('CELL')
		expect(table.rows.rows()).toStrictEqual(before)
	})

	it('moves a row to a clamped index, emits write, and keeps a no-op silent', () => {
		const table = createTableFixture()
		const writes = createRecorder<TableEventMap['write']>()
		table.emitter.on('write', writes.handler)

		expect(table.rows.move('1', 99)).toBe(true)
		expect(table.rows.rows().map((row) => row.id)).toStrictEqual(['2', '3', '4', '1'])
		expect(table.rows.move('1', 3)).toBe(true)
		expect(table.rows.move('missing', 0)).toBe(false)
		expect(writes.calls).toStrictEqual([['1']])
	})

	it('removes zero, one, or many rows and validates a batch atomically', () => {
		const table = createTableFixture()
		const removes = createRecorder<TableEventMap['remove']>()
		table.emitter.on('remove', removes.handler)

		expect(table.rows.remove([])).toBe(true)
		expect(table.rows.remove('1')).toBe(true)
		expect(table.rows.remove(['2', 'missing'])).toBe(false)
		expect(table.rows.rows().map((row) => row.id)).toStrictEqual(['2', '3', '4'])
		expect(table.rows.remove(['2', '3'])).toBe(true)
		table.rows.remove()

		expect(table.rows.rows()).toStrictEqual([])
		expect(removes.calls).toStrictEqual([['1'], ['2'], ['3'], ['4']])
	})
})
