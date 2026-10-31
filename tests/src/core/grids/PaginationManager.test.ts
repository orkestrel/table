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
