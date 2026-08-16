import type { CellComparator, TableEventMap } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { createTableFixture, readTableError } from '../../../setup.js'

describe('SortManager', () => {
	it('sets one or many terms and replaces a term in place', () => {
		const table = createTableFixture()

		table.sort.set({ column: 'name', direction: 'ascending' })
		table.sort.set([
			{ column: 'age', direction: 'descending' },
			{ column: 'name', direction: 'descending' },
		])

		expect(table.sort.order('name')).toStrictEqual({ column: 'name', direction: 'descending' })
		expect(table.sort.orders()).toStrictEqual([
			{ column: 'name', direction: 'descending' },
			{ column: 'age', direction: 'descending' },
		])
	})

	it('returns fresh frozen term snapshots', () => {
		const table = createTableFixture()
		table.sort.set({ column: 'age', direction: 'ascending' })

		expect(table.sort.orders()).not.toBe(table.sort.orders())
		expect(Object.isFrozen(table.sort.orders())).toBe(true)
		expect(Object.isFrozen(table.sort.order('age'))).toBe(true)
	})

	it('refuses an undeclared column atomically', () => {
		const table = createTableFixture()
		table.sort.set({ column: 'name', direction: 'ascending' })

		expect(
			readTableError(() =>
				table.sort.set([
					{ column: 'age', direction: 'ascending' },
					{ column: 'missing', direction: 'ascending' },
				]),
			),
		).toBe('COLUMN')
		expect(table.sort.orders()).toStrictEqual([{ column: 'name', direction: 'ascending' }])
	})

	it('removes zero, one, or many terms and keeps no-ops silent', () => {
		const table = createTableFixture()
		const sorts = createRecorder<TableEventMap['sort']>()
		table.sort.set([
			{ column: 'name', direction: 'ascending' },
			{ column: 'age', direction: 'descending' },
		])
		table.emitter.on('sort', sorts.handler)

		table.sort.set([])
		expect(table.sort.remove([])).toBe(true)
		expect(table.sort.remove('status')).toBe(true)
		expect(table.sort.remove(['age', 'missing'])).toBe(false)
		expect(table.sort.remove('age')).toBe(true)
		table.sort.remove()
		table.sort.remove()

		expect(table.sort.orders()).toStrictEqual([])
		expect(sorts.count).toBe(2)
	})

	it('routes a column through its comparator override in both directions', () => {
		const byLength: CellComparator = (left, right) =>
			String(left ?? '').length - String(right ?? '').length
		const table = createTableFixture({ comparators: { name: byLength } })

		table.sort.set({ column: 'name', direction: 'ascending' })
		expect(table.view.map((row) => row.name)).toStrictEqual(['Ada', 'Lin', 'Alan', 'Grace'])
		table.sort.set({ column: 'name', direction: 'descending' })
		expect(table.view.map((row) => row.name)).toStrictEqual(['Grace', 'Alan', 'Ada', 'Lin'])
	})
})
