import type { TableEventMap } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { createTableFixture } from '../../../setup.js'

describe('PaginationManager', () => {
	it('reports the unpaged defaults from derived state', () => {
		const table = createTableFixture()

		expect({
			page: table.pagination.page,
			limit: table.pagination.limit,
			offset: table.pagination.offset,
			count: table.pagination.count,
		}).toStrictEqual({ page: 1, limit: undefined, offset: 0, count: 1 })
		expect(table.view).toHaveLength(4)
	})

	it('moves between pages counted from one and clamps both ends', () => {
		const table = createTableFixture({ limit: 2 })
		const pages = createRecorder<TableEventMap['paginate']>()
		table.emitter.on('paginate', pages.handler)

		table.pagination.move(99)
		table.pagination.move(2)
		table.pagination.move(-1)
		table.pagination.move(1)
		table.pagination.move(Number.POSITIVE_INFINITY)

		expect(table.pagination.page).toBe(table.pagination.count)

		table.pagination.move(Number.NaN)

		expect(table.pagination.page).toBe(1)
		expect(table.pagination.offset).toBe(0)
		expect(pages.calls).toStrictEqual([[2], [1], [2], [1]])
	})

	it('floors a page size below one, and a non-finite one, at a single row', () => {
		const table = createTableFixture({ limit: 2 })

		expect(table.pagination.limit).toBe(2)
		table.pagination.resize(0)
		expect(table.pagination.limit).toBe(1)
		table.pagination.resize(Number.POSITIVE_INFINITY)
		expect(table.pagination.limit).toBe(1)
		table.pagination.resize(Number.NaN)
		expect(table.pagination.limit).toBe(1)
	})

	it('resizes while keeping the first row previously shown', () => {
		const table = createTableFixture({ limit: 2 })
		table.pagination.move(2)

		table.pagination.resize(3)

		expect(table.pagination.limit).toBe(3)
		expect(table.pagination.page).toBe(1)
		expect(table.view.map((row) => row.id)).toStrictEqual(['1', '2', '3'])
	})

	it('stops paging when resize receives no argument', () => {
		const table = createTableFixture({ limit: 1 })
		table.pagination.move(3)

		table.pagination.resize()

		expect(table.pagination.limit).toBeUndefined()
		expect(table.pagination.page).toBe(1)
		expect(table.pagination.offset).toBe(0)
		expect(table.view).toHaveLength(4)
	})

	it('clamps after rows leave and stays silent when the page does not move', () => {
		const table = createTableFixture({ limit: 2 })
		const pages = createRecorder<TableEventMap['paginate']>()
		table.pagination.move(2)
		table.emitter.on('paginate', pages.handler)

		table.rows.remove('4')
		table.rows.remove('3')

		expect(table.pagination.page).toBe(1)
		expect(table.pagination.count).toBe(1)
		expect(pages.calls).toStrictEqual([[1]])
	})
})
