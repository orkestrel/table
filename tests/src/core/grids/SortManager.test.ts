import type { GridEventMap } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { compareTextByLength, createGridFixture, readGridError } from '../../../setup.js'

describe('SortManager', () => {
	it('sets one or many terms and replaces a term in place', () => {
		const grid = createGridFixture()

		grid.sort.set({ column: 'name', direction: 'ascending' })
		grid.sort.set([
			{ column: 'age', direction: 'descending' },
			{ column: 'name', direction: 'descending' },
		])

		expect(grid.sort.order('name')).toStrictEqual({ column: 'name', direction: 'descending' })
		expect(grid.sort.orders()).toStrictEqual([
			{ column: 'name', direction: 'descending' },
			{ column: 'age', direction: 'descending' },
		])
	})

	it('returns fresh frozen term snapshots', () => {
		const grid = createGridFixture()
		grid.sort.set({ column: 'age', direction: 'ascending' })

		expect(grid.sort.orders()).not.toBe(grid.sort.orders())
		expect(Object.isFrozen(grid.sort.orders())).toBe(true)
		expect(Object.isFrozen(grid.sort.order('age'))).toBe(true)
	})

	it('refuses an undeclared column atomically', () => {
		const grid = createGridFixture()
		grid.sort.set({ column: 'name', direction: 'ascending' })

		expect(
			readGridError(() =>
				grid.sort.set([
					{ column: 'age', direction: 'ascending' },
					{ column: 'missing', direction: 'ascending' },
				]),
			),
		).toBe('COLUMN')
		expect(grid.sort.orders()).toStrictEqual([{ column: 'name', direction: 'ascending' }])
	})

	it('removes zero, one, or many terms and keeps no-ops silent', () => {
		const grid = createGridFixture()
		const sorts = createRecorder<GridEventMap['sort']>()
		grid.sort.set([
			{ column: 'name', direction: 'ascending' },
			{ column: 'age', direction: 'descending' },
		])
		grid.emitter.on('sort', sorts.handler)

		grid.sort.set([])
		expect(grid.sort.remove([])).toBe(true)
		expect(grid.sort.remove('status')).toBe(true)
		expect(grid.sort.remove(['age', 'missing'])).toBe(false)
		expect(grid.sort.remove('age')).toBe(true)
		grid.sort.remove()
		grid.sort.remove()

		expect(grid.sort.orders()).toStrictEqual([])
		expect(sorts.count).toBe(2)
	})

	it('routes a column through its comparator override in both directions', () => {
		const grid = createGridFixture({ comparators: { name: compareTextByLength } })

		grid.sort.set({ column: 'name', direction: 'ascending' })
		expect(grid.view.map((row) => row.name)).toStrictEqual(['Ada', 'Lin', 'Alan', 'Grace'])
		grid.sort.set({ column: 'name', direction: 'descending' })
		expect(grid.view.map((row) => row.name)).toStrictEqual(['Grace', 'Alan', 'Ada', 'Lin'])
	})
})
