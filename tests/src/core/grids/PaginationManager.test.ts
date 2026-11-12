import type { GridEventMap } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { createGridFixture } from '../../../setup.js'

describe('PaginationManager', () => {
	it('reports the unpaged defaults from derived state', () => {
		const grid = createGridFixture()

		expect({
			page: grid.pagination.page,
			limit: grid.pagination.limit,
			offset: grid.pagination.offset,
			count: grid.pagination.count,
		}).toStrictEqual({ page: 1, limit: undefined, offset: 0, count: 1 })
		expect(grid.view).toHaveLength(4)
	})

	it('moves between pages counted from one and clamps both ends', () => {
		const grid = createGridFixture({ limit: 2 })
		const pages = createRecorder<GridEventMap['paginate']>()
		grid.emitter.on('paginate', pages.handler)

		grid.pagination.move(99)
		grid.pagination.move(2)
		grid.pagination.move(-1)
		grid.pagination.move(1)
		grid.pagination.move(Number.POSITIVE_INFINITY)

		expect(grid.pagination.page).toBe(grid.pagination.count)

		grid.pagination.move(Number.NaN)

		expect(grid.pagination.page).toBe(1)
		expect(grid.pagination.offset).toBe(0)
		expect(pages.calls).toStrictEqual([[2], [1], [2], [1]])
	})

	it('locates a row on the page that holds it, either side of each page boundary', () => {
		const grid = createGridFixture({
			limit: 2,
			rows: ['1', '2', '3', '4', '5'].map((id) => ({ id, name: `Row ${id}` })),
		})

		expect(['1', '2', '3', '4', '5'].map((key) => grid.pagination.locate(key))).toStrictEqual([
			1, 1, 2, 2, 3,
		])
	})

	it('locates a row under the sort and follows a change of sort', () => {
		const grid = createGridFixture({ limit: 2 })
		grid.sort.set({ column: 'name', direction: 'ascending' })

		expect(['1', '3', '2', '4'].map((key) => grid.pagination.locate(key))).toStrictEqual([
			1, 1, 2, 2,
		])

		grid.sort.set({ column: 'name', direction: 'descending' })

		expect(['4', '2', '3', '1'].map((key) => grid.pagination.locate(key))).toStrictEqual([
			1, 1, 2, 2,
		])
	})

	it('locates a row under the filter, counting only the rows the filter admits', () => {
		const grid = createGridFixture({ limit: 1 })
		grid.filter.set({ column: 'active', operator: 'equals', value: true })

		expect(grid.pagination.locate('1')).toBe(1)
		expect(grid.pagination.locate('3')).toBe(2)
		expect(grid.pagination.count).toBe(2)

		grid.filter.remove()

		expect(grid.pagination.locate('3')).toBe(3)
	})

	it('answers undefined for a row the filter hides and for a key no row holds', () => {
		const grid = createGridFixture({ limit: 2 })
		grid.filter.set({ column: 'active', operator: 'equals', value: true })

		expect(grid.pagination.locate('2')).toBeUndefined()
		expect(grid.pagination.locate('missing')).toBeUndefined()
		expect(grid.pagination.locate('')).toBeUndefined()

		grid.filter.remove()

		expect(grid.pagination.locate('2')).toBe(1)
	})

	it('answers undefined over a grid with no rows', () => {
		const grid = createGridFixture({ limit: 2, rows: [] })

		expect(grid.pagination.locate('1')).toBeUndefined()
	})

	it('answers the one page of a grid that is not paged, and still refuses a hidden row', () => {
		const grid = createGridFixture()
		grid.filter.set({ column: 'active', operator: 'equals', value: true })

		expect(grid.pagination.locate('3')).toBe(1)
		expect(grid.pagination.locate('4')).toBeUndefined()
	})

	it('agrees with the page whose view holds the row, under a filter, a sort, and each page size', () => {
		const grid = createGridFixture({ limit: 1 })
		grid.filter.set({ column: 'age', operator: 'between', minimum: 30, maximum: 50 })
		grid.sort.set({ column: 'age', direction: 'descending' })
		const shown: number[] = []
		const located: Array<number | undefined> = []

		for (const limit of [1, 2, 3]) {
			grid.pagination.resize(limit)
			for (const page of Array.from({ length: grid.pagination.count }, (_, index) => index + 1)) {
				grid.pagination.move(page)
				for (const row of grid.view) {
					shown.push(page)
					located.push(grid.pagination.locate(String(row.id)))
				}
			}
		}

		expect(shown).toHaveLength(9)
		expect(located).toStrictEqual(shown)
	})

	it('moves nothing when it locates, and showing the page it names shows the row', () => {
		const grid = createGridFixture({ limit: 1 })
		const pages = createRecorder<GridEventMap['paginate']>()
		grid.emitter.on('paginate', pages.handler)
		grid.sort.set({ column: 'name', direction: 'descending' })

		const page = grid.pagination.locate('1')

		expect({ page, shown: grid.pagination.page, calls: pages.calls }).toStrictEqual({
			page: 4,
			shown: 1,
			calls: [],
		})
		if (page !== undefined) grid.pagination.move(page)
		expect(grid.view.map((row) => row.id)).toStrictEqual(['1'])
	})

	it('locates by the comparator and the matcher the grid was opened with', () => {
		const grid = createGridFixture({
			limit: 1,
			comparators: { name: (left, right) => String(right).localeCompare(String(left)) },
			matchers: { name: (cell) => cell === 'Alan' || cell === 'Grace' },
		})
		grid.sort.set({ column: 'name', direction: 'ascending' })
		grid.filter.set({ column: 'name', operator: 'contains', text: 'unmatched' })

		expect(['2', '3', '1', '4'].map((key) => grid.pagination.locate(key))).toStrictEqual([
			1,
			2,
			undefined,
			undefined,
		])
	})

	it('floors a page size below one, and a non-finite one, at a single row', () => {
		const grid = createGridFixture({ limit: 2 })

		expect(grid.pagination.limit).toBe(2)
		grid.pagination.resize(0)
		expect(grid.pagination.limit).toBe(1)
		grid.pagination.resize(Number.POSITIVE_INFINITY)
		expect(grid.pagination.limit).toBe(1)
		grid.pagination.resize(Number.NaN)
		expect(grid.pagination.limit).toBe(1)
	})

	it('resizes while keeping the first row previously shown', () => {
		const grid = createGridFixture({ limit: 2 })
		grid.pagination.move(2)

		grid.pagination.resize(3)

		expect(grid.pagination.limit).toBe(3)
		expect(grid.pagination.page).toBe(1)
		expect(grid.view.map((row) => row.id)).toStrictEqual(['1', '2', '3'])
	})

	it('stops paging when resize receives no argument', () => {
		const grid = createGridFixture({ limit: 1 })
		grid.pagination.move(3)

		grid.pagination.resize()

		expect(grid.pagination.limit).toBeUndefined()
		expect(grid.pagination.page).toBe(1)
		expect(grid.pagination.offset).toBe(0)
		expect(grid.view).toHaveLength(4)
	})

	it('clamps after rows leave and stays silent when the page does not move', () => {
		const grid = createGridFixture({ limit: 2 })
		const pages = createRecorder<GridEventMap['paginate']>()
		grid.pagination.move(2)
		grid.emitter.on('paginate', pages.handler)

		grid.rows.remove('4')
		grid.rows.remove('3')

		expect(grid.pagination.page).toBe(1)
		expect(grid.pagination.count).toBe(1)
		expect(pages.calls).toStrictEqual([[1]])
	})
})
