import type { TableEventMap, TableFilter } from '@src/core'
import { admitsFilter, matchesFilter } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	createFilterAdmissibilityVectors,
	createTableFixture,
	matchTextLoosely,
	readTableError,
} from '../../../setup.js'

describe('FilterManager', () => {
	it('sets one or many filters and replaces a column in place', () => {
		const table = createTableFixture()

		table.filter.set({ column: 'name', operator: 'contains', text: 'a' })
		table.filter.set([
			{ column: 'age', operator: 'between', minimum: 35, maximum: 45 },
			{ column: 'name', operator: 'contains', text: 'A' },
		])

		expect(table.filter.filter('name')).toStrictEqual({
			column: 'name',
			operator: 'contains',
			text: 'A',
		})
		expect(table.filter.filters().map((filter) => filter.column)).toStrictEqual(['name', 'age'])
		expect(table.count).toBe(2)
	})

	it('refuses undeclared columns, incompatible operators, and invalid operands atomically', () => {
		const table = createTableFixture()
		table.filter.set({ column: 'active', operator: 'equals', value: true })

		expect(
			readTableError(() =>
				table.filter.set([
					{ column: 'name', operator: 'contains', text: 'a' },
					{ column: 'missing', operator: 'equals', value: 'x' },
				]),
			),
		).toBe('COLUMN')
		expect(
			readTableError(() => table.filter.set({ column: 'age', operator: 'contains', text: '4' })),
		).toBe('CELL')
		expect(
			readTableError(() =>
				table.filter.set({ column: 'age', operator: 'between', minimum: 'old', maximum: 50 }),
			),
		).toBe('CELL')
		expect(table.filter.filters()).toStrictEqual([
			{ column: 'active', operator: 'equals', value: true },
		])
	})

	it('keeps filter admission identical at the helper, matcher, and manager doors', () => {
		const table = createTableFixture()

		for (const vector of createFilterAdmissibilityVectors()) {
			expect(admitsFilter(vector.column, vector.filter)).toBe(vector.admitted)
			expect(matchesFilter(vector.column, vector.cell, vector.filter)).toBe(vector.admitted)
			expect(readTableError(() => table.filter.set(vector.filter))).toBe(
				vector.admitted ? undefined : 'CELL',
			)
		}
	})

	it('removes zero, one, or many filters and validates every column first', () => {
		const table = createTableFixture()
		table.filter.set([
			{ column: 'name', operator: 'contains', text: 'a' },
			{ column: 'active', operator: 'equals', value: true },
		])

		expect(table.filter.remove([])).toBe(true)
		expect(table.filter.remove(['name', 'missing'])).toBe(false)
		expect(table.filter.filters()).toHaveLength(2)
		expect(table.filter.remove('name')).toBe(true)
		table.filter.remove()

		expect(table.filter.filters()).toStrictEqual([])
	})

	it('routes one column through its matcher override', () => {
		const table = createTableFixture({ matchers: { name: matchTextLoosely } })

		table.filter.set({ column: 'name', operator: 'contains', text: 'ADA' })

		expect(table.view.map((row) => row.id)).toStrictEqual(['1'])
	})

	it('emits filter before paginate when narrowing clamps the page', () => {
		const table = createTableFixture({
			rows: [
				{ id: '1', active: true },
				{ id: '2', active: true },
				{ id: '3', active: false },
			],
			limit: 1,
		})
		const events: string[] = []
		table.pagination.move(3)
		table.emitter.on('filter', () => events.push(`filter:${table.pagination.page}`))
		table.emitter.on('paginate', (page) => events.push(`paginate:${page}`))

		table.filter.set({ column: 'active', operator: 'equals', value: true })

		expect(table.pagination.page).toBe(2)
		expect(events).toStrictEqual(['filter:2', 'paginate:2'])
	})

	it('returns fresh frozen filter snapshots and keeps repeated terms silent', () => {
		const table = createTableFixture()
		const filters = createRecorder<TableEventMap['filter']>()
		table.emitter.on('filter', filters.handler)
		const filter: TableFilter = { column: 'name', operator: 'contains', text: 'a' }

		table.filter.set([])
		table.filter.set(filter)
		table.filter.set(filter)

		expect(table.filter.filters()).not.toBe(table.filter.filters())
		expect(Object.isFrozen(table.filter.filters())).toBe(true)
		expect(Object.isFrozen(table.filter.filter('name'))).toBe(true)
		expect(filters.count).toBe(1)
	})
})
