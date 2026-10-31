import { createGrid, Grid } from '@src/core'
import { describe, expect, it } from 'vitest'
import { createGridRows, createGridSchema, readGridError } from '../../setup.js'

describe('createGrid', () => {
	it('returns a working Grid through the interface construction path', () => {
		const grid = createGrid(createGridSchema(), { rows: createGridRows(), limit: 2 })

		expect(grid).toBeInstanceOf(Grid)
		expect(grid.count).toBe(4)
		expect(grid.view.map((row) => row.id)).toStrictEqual(['1', '2'])
	})

	it('takes the same schema refusal path as the class', () => {
		expect(
			readGridError(() => createGrid({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] })),
		).toBe('SCHEMA')
	})

	it('seeds quietly and forwards emitter options', () => {
		const events: string[] = []
		const grid = createGrid(createGridSchema(), {
			rows: createGridRows(),
			on: { write: (key) => events.push(key) },
		})

		expect(events).toStrictEqual([])
		grid.rows.add({ id: '5', name: 'Katherine', age: 37, active: true, status: 'draft' })
		expect(events).toStrictEqual(['5'])
	})
})
