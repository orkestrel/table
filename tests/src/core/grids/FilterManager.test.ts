import type { GridEventMap, GridFilter } from '@src/core'
import { admitsFilter, matchesFilter } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	createFilterAdmissibilityVectors,
	createGridFixture,
	matchTextLoosely,
	readGridError,
} from '../../../setup.js'

describe('FilterManager', () => {
	it('sets one or many filters and replaces a column in place', () => {
		const grid = createGridFixture()

		grid.filter.set({ column: 'name', operator: 'contains', text: 'a' })
		grid.filter.set([
			{ column: 'age', operator: 'between', minimum: 35, maximum: 45 },
			{ column: 'name', operator: 'contains', text: 'A' },
		])

		expect(grid.filter.filter('name')).toStrictEqual({
			column: 'name',
			operator: 'contains',
			text: 'A',
		})
		expect(grid.filter.filters().map((filter) => filter.column)).toStrictEqual(['name', 'age'])
		expect(grid.count).toBe(2)
	})

	it('refuses undeclared columns, incompatible operators, and invalid operands atomically', () => {
		const grid = createGridFixture()
		grid.filter.set({ column: 'active', operator: 'equals', value: true })

		expect(
			readGridError(() =>
				grid.filter.set([
					{ column: 'name', operator: 'contains', text: 'a' },
					{ column: 'missing', operator: 'equals', value: 'x' },
				]),
			),
		).toBe('COLUMN')
		expect(
			readGridError(() => grid.filter.set({ column: 'age', operator: 'contains', text: '4' })),
		).toBe('CELL')
		expect(
			readGridError(() =>
				grid.filter.set({ column: 'age', operator: 'between', minimum: 'old', maximum: 50 }),
			),
		).toBe('CELL')
		expect(grid.filter.filters()).toStrictEqual([
			{ column: 'active', operator: 'equals', value: true },
		])
	})

	it('keeps filter admission aligned without conflating it with the match outcome', () => {
		const grid = createGridFixture()

		for (const vector of createFilterAdmissibilityVectors()) {
			expect(admitsFilter(vector.column, vector.filter)).toBe(vector.admitted)
			expect(matchesFilter(vector.column, vector.cell, vector.filter)).toBe(vector.admitted)
			expect(readGridError(() => grid.filter.set(vector.filter))).toBe(
				vector.admitted ? 'NO_THROW' : 'CELL',
			)
		}

		const column = grid.schema.columns.find((candidate) => candidate.key === 'name')
		if (column === undefined) throw new Error('Expected name column')
		const filter: GridFilter = { column: 'name', operator: 'contains', text: 'z' }
		expect(admitsFilter(column, filter)).toBe(true)
		expect(matchesFilter(column, 'Ada', filter)).toBe(false)
		expect(readGridError(() => grid.filter.set(filter))).toBe('NO_THROW')
	})

	it('removes zero, one, or many filters and validates every column first', () => {
		const grid = createGridFixture()
		grid.filter.set([
			{ column: 'name', operator: 'contains', text: 'a' },
			{ column: 'active', operator: 'equals', value: true },
		])

		expect(grid.filter.remove([])).toBe(true)
		expect(grid.filter.remove(['name', 'missing'])).toBe(false)
		expect(grid.filter.filters()).toHaveLength(2)
		expect(grid.filter.remove('name')).toBe(true)
		grid.filter.remove()

		expect(grid.filter.filters()).toStrictEqual([])
	})

	it('routes one column through its matcher override', () => {
		const grid = createGridFixture({ matchers: { name: matchTextLoosely } })

		grid.filter.set({ column: 'name', operator: 'contains', text: 'ADA' })

		expect(grid.view.map((row) => row.id)).toStrictEqual(['1'])
	})

	it('emits filter before paginate when narrowing clamps the page', () => {
		const grid = createGridFixture({
			rows: [
				{ id: '1', active: true },
				{ id: '2', active: true },
				{ id: '3', active: false },
			],
			limit: 1,
		})
		const events: string[] = []
		grid.pagination.move(3)
		grid.emitter.on('filter', () => events.push(`filter:${grid.pagination.page}`))
		grid.emitter.on('paginate', (page) => events.push(`paginate:${page}`))

		grid.filter.set({ column: 'active', operator: 'equals', value: true })

		expect(grid.pagination.page).toBe(2)
		expect(events).toStrictEqual(['filter:2', 'paginate:2'])
	})

	it('returns fresh frozen filter snapshots and keeps repeated terms silent', () => {
		const grid = createGridFixture()
		const filters = createRecorder<GridEventMap['filter']>()
		grid.emitter.on('filter', filters.handler)
		const filter: GridFilter = { column: 'name', operator: 'contains', text: 'a' }

		grid.filter.set([])
		grid.filter.set(filter)
		grid.filter.set(filter)

		expect(grid.filter.filters()).not.toBe(grid.filter.filters())
		expect(Object.isFrozen(grid.filter.filters())).toBe(true)
		expect(Object.isFrozen(grid.filter.filter('name'))).toBe(true)
		expect(filters.count).toBe(1)
	})
})
