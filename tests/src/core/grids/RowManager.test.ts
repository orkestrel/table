import type { GridEventMap, GridRow } from '@src/core'
import { parseRows } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { createGridFixture, readGridError } from '../../../setup.js'

describe('RowManager reads and writes', () => {
	it('replaces whole rows atomically while retaining order, selection, expansion, and ownership', () => {
		const grid = createGridFixture()
		grid.selection.select('1')
		grid.expansion.expand('1')
		const writes = createRecorder<GridEventMap['write']>()
		grid.emitter.on('write', writes.handler)
		const row = { id: '1', name: 'Replaced' }
		const keys = grid.rows.rows().map((entry) => entry.id)
		expect(grid.rows.replace(row)).toBe(true)
		row.name = 'Caller edit'
		expect(grid.rows.row('1')).toEqual({ id: '1', name: 'Replaced' })
		expect(grid.rows.rows().map((entry) => entry.id)).toEqual(keys)
		expect(grid.selection.keys.has('1')).toBe(true)
		expect(grid.expansion.keys.has('1')).toBe(true)
		expect(writes.calls).toEqual([['1']])
		expect(grid.rows.replace({ id: '1', name: 'Replaced' })).toBe(true)
		expect(writes.count).toBe(1)
		expect(grid.rows.replace([{ id: '1', name: 'Lost' }, { id: 'absent' }])).toBe(false)
		expect(
			readGridError(() =>
				grid.rows.replace([
					{ id: '1', name: 'Lost' },
					{ id: '2', age: 'old' },
				]),
			),
		).toBe('CELL')
		expect(grid.rows.row('1')).toEqual({ id: '1', name: 'Replaced' })
		expect(grid.rows.replace([])).toBe(true)
		expect(
			grid.rows.replace([
				{ id: '1', name: 'Intermediate' },
				{ id: '1', name: 'Final' },
			]),
		).toBe(true)
		expect(grid.rows.row('1')).toEqual({ id: '1', name: 'Final' })
		expect(writes.calls).toEqual([['1'], ['1']])
		grid.destroy()
		expect(readGridError(() => grid.rows.replace({ id: '1' }))).toBe('DESTROYED')
	})

	it('finds rows and returns owned frozen snapshots', () => {
		const grid = createGridFixture()
		const first = grid.rows.row('1')
		const all = grid.rows.rows()

		expect(first).toStrictEqual(all[0])
		expect(first).not.toBe(all[0])
		expect(Object.isFrozen(first)).toBe(true)
		expect(Object.isFrozen(all)).toBe(true)
		expect(grid.rows.row('missing')).toBeUndefined()
	})

	it('adds one or many rows and emits each committed key in order', () => {
		const grid = createGridFixture({ rows: [] })
		const writes = createRecorder<GridEventMap['write']>()
		grid.emitter.on('write', writes.handler)

		grid.rows.add({ id: '1', name: 'Ada' })
		grid.rows.add([
			{ id: '2', name: 'Grace' },
			{ id: '3', name: 'Alan' },
		])
		grid.rows.add([])

		expect(grid.rows.rows().map((row) => row.id)).toStrictEqual(['1', '2', '3'])
		expect(writes.calls).toStrictEqual([['1'], ['2'], ['3']])
	})

	it('refuses a duplicate or invalid cell batch atomically', () => {
		const grid = createGridFixture({ rows: [] })
		const writes = createRecorder<GridEventMap['write']>()
		grid.emitter.on('write', writes.handler)
		const duplicate: readonly GridRow[] = [{ id: '1' }, { id: '1' }]

		expect(readGridError(() => grid.rows.add(duplicate))).toBe('KEY')
		expect(readGridError(() => grid.rows.add([{ id: '1' }, { id: '2', age: 'old' }]))).toBe('CELL')
		expect(grid.rows.rows()).toStrictEqual([])
		expect(writes.count).toBe(0)
	})

	it('codes every unusable identity as KEY before cell compatibility', () => {
		const grid = createGridFixture({ rows: [] })

		expect(readGridError(() => grid.rows.add({ id: 2 }))).toBe('KEY')
		expect(readGridError(() => grid.rows.update({ id: 2 }))).toBe('KEY')
		expect(parseRows(grid.schema, [{ id: 2 }])).toBeUndefined()
	})

	it('merges one or many updates and withholds no-op events', () => {
		const grid = createGridFixture()
		const writes = createRecorder<GridEventMap['write']>()
		grid.emitter.on('write', writes.handler)

		expect(grid.rows.update([])).toBe(true)
		expect(grid.rows.update({ id: '1', age: 37 })).toBe(true)
		expect(
			grid.rows.update([
				{ id: '2', active: true },
				{ id: '3', name: 'Alan' },
			]),
		).toBe(true)

		expect(grid.rows.row('1')).toMatchObject({ id: '1', name: 'Ada', age: 37 })
		expect(writes.calls).toStrictEqual([['1'], ['2']])
	})

	it('returns false and changes nothing when an update key is absent', () => {
		const grid = createGridFixture()
		const before = grid.rows.rows()

		expect(
			grid.rows.update([
				{ id: '1', age: 99 },
				{ id: 'missing', age: 1 },
			]),
		).toBe(false)
		expect(grid.rows.rows()).toStrictEqual(before)
	})

	it('validates every update before committing any of them', () => {
		const grid = createGridFixture()
		const before = grid.rows.rows()

		expect(
			readGridError(() =>
				grid.rows.update([
					{ id: '1', age: 99 },
					{ id: '2', age: 'old' },
				]),
			),
		).toBe('CELL')
		expect(grid.rows.rows()).toStrictEqual(before)
	})

	it('moves a row to a clamped index, emits write, and keeps a no-op silent', () => {
		const grid = createGridFixture()
		const writes = createRecorder<GridEventMap['write']>()
		grid.emitter.on('write', writes.handler)

		expect(grid.rows.move('1', 99)).toBe(true)
		expect(grid.rows.rows().map((row) => row.id)).toStrictEqual(['2', '3', '4', '1'])
		expect(grid.rows.move('1', 3)).toBe(true)
		expect(grid.rows.move('missing', 0)).toBe(false)
		expect(grid.rows.move('2', Number.POSITIVE_INFINITY)).toBe(true)
		expect(grid.rows.rows().map((row) => row.id)).toStrictEqual(['3', '4', '1', '2'])
		expect(grid.rows.move('2', Number.NaN)).toBe(true)
		expect(grid.rows.rows().map((row) => row.id)).toStrictEqual(['2', '3', '4', '1'])
		expect(grid.rows.move('2', Number.NEGATIVE_INFINITY)).toBe(true)
		expect(grid.rows.rows().map((row) => row.id)).toStrictEqual(['2', '3', '4', '1'])
		expect(writes.calls).toStrictEqual([['1'], ['2'], ['2']])
	})

	it('removes zero, one, or many rows and validates a batch atomically', () => {
		const grid = createGridFixture()
		const removes = createRecorder<GridEventMap['remove']>()
		grid.emitter.on('remove', removes.handler)

		expect(grid.rows.remove([])).toBe(true)
		expect(grid.rows.remove('1')).toBe(true)
		expect(grid.rows.remove(['2', 'missing'])).toBe(false)
		expect(grid.rows.rows().map((row) => row.id)).toStrictEqual(['2', '3', '4'])
		expect(grid.rows.remove(['2', '3'])).toBe(true)
		grid.rows.remove()

		expect(grid.rows.rows()).toStrictEqual([])
		expect(removes.calls).toStrictEqual([['1'], ['2'], ['3'], ['4']])
	})
})
