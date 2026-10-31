import type { GridEventMap } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { createGridFixture } from '../../../setup.js'

describe('ExpansionManager', () => {
	it('expands zero, one, or many rows and all rows with no argument', () => {
		const grid = createGridFixture()

		expect(grid.expansion.expand([])).toBe(true)
		expect(grid.expansion.expand('1')).toBe(true)
		expect(grid.expansion.expand(['2', '3'])).toBe(true)
		grid.expansion.expand()

		expect([...grid.expansion.keys]).toStrictEqual(['1', '2', '3', '4'])
	})

	it('validates expansion, clear, and toggle batches before changing keys', () => {
		const grid = createGridFixture()
		grid.expansion.expand('1')

		expect(grid.expansion.expand(['2', 'missing'])).toBe(false)
		expect(grid.expansion.clear(['1', 'missing'])).toBe(false)
		expect(grid.expansion.toggle(['1', 'missing'])).toBe(false)
		expect([...grid.expansion.keys]).toStrictEqual(['1'])
	})

	it('clears and toggles zero, one, or many rows', () => {
		const grid = createGridFixture()
		const expansions = createRecorder<GridEventMap['expand']>()
		grid.emitter.on('expand', expansions.handler)
		grid.expansion.expand(['1', '2', '3'])

		expect(grid.expansion.toggle(['1', '1'])).toBe(true)
		expect(grid.expansion.clear([])).toBe(true)
		expect(grid.expansion.clear('4')).toBe(true)
		expect(grid.expansion.clear(['1', '2'])).toBe(true)
		expect(grid.expansion.toggle(['3', '4'])).toBe(true)
		grid.expansion.clear()

		expect(grid.expansion.keys.size).toBe(0)
		expect(expansions.count).toBe(4)
	})

	it('returns owned sets, emits only changes, and prunes removed rows', () => {
		const grid = createGridFixture()
		const expansions = createRecorder<GridEventMap['expand']>()
		grid.emitter.on('expand', expansions.handler)

		grid.expansion.expand(['1', '2'])
		const held = grid.expansion.keys
		grid.expansion.expand(['1', '2'])
		grid.rows.remove('1')

		expect([...held]).toStrictEqual(['1', '2'])
		expect([...grid.expansion.keys]).toStrictEqual(['2'])
		expect(expansions.calls.map((call) => [...call[0]])).toStrictEqual([['1', '2'], ['2']])
	})
})
