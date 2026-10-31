import type { GridEventMap } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { createGridFixture } from '../../../setup.js'

describe('SelectionManager', () => {
	it('selects zero, one, or many rows and all rows with no argument', () => {
		const grid = createGridFixture()

		expect(grid.selection.select([])).toBe(true)
		expect(grid.selection.select('1')).toBe(true)
		expect(grid.selection.select(['2', '3'])).toBe(true)
		grid.selection.select()

		expect([...grid.selection.keys]).toStrictEqual(['1', '2', '3', '4'])
	})

	it('validates a selection batch before changing any key', () => {
		const grid = createGridFixture()

		expect(grid.selection.select(['1', 'missing', '2'])).toBe(false)
		expect(grid.selection.keys.size).toBe(0)
	})

	it('clears zero, one, or many picks and treats a known unpicked key as success', () => {
		const grid = createGridFixture()
		grid.selection.select(['1', '2', '3'])

		expect(grid.selection.clear([])).toBe(true)
		expect(grid.selection.clear('4')).toBe(true)
		expect(grid.selection.clear(['1', '2'])).toBe(true)
		expect(grid.selection.clear(['3', 'missing'])).toBe(false)
		grid.selection.clear()

		expect(grid.selection.keys.size).toBe(0)
	})

	it('toggles one or many keys atomically', () => {
		const grid = createGridFixture()
		const selections = createRecorder<GridEventMap['select']>()
		grid.emitter.on('select', selections.handler)
		grid.selection.select('1')

		expect(grid.selection.toggle(['1', '1'])).toBe(true)
		expect(grid.selection.toggle(['1', '2'])).toBe(true)
		expect([...grid.selection.keys]).toStrictEqual(['2'])
		expect(grid.selection.toggle(['2', 'missing'])).toBe(false)
		expect([...grid.selection.keys]).toStrictEqual(['2'])
		expect(selections.count).toBe(2)
	})

	it('returns owned key sets, emits only changes, and prunes removed rows', () => {
		const grid = createGridFixture()
		const selections = createRecorder<GridEventMap['select']>()
		grid.emitter.on('select', selections.handler)

		grid.selection.select(['1', '2'])
		const held = grid.selection.keys
		grid.selection.select(['1', '2'])
		grid.rows.remove('1')

		expect(held).not.toBe(grid.selection.keys)
		expect([...held]).toStrictEqual(['1', '2'])
		expect([...grid.selection.keys]).toStrictEqual(['2'])
		expect(selections.calls.map((call) => [...call[0]])).toStrictEqual([['1', '2'], ['2']])
	})
})
