import { expect, it } from 'vitest'
import { createGrid } from '@src/core'
import { createTableBinding, readTable, TableBinding, TableBindingError } from '@src/browser'
import { createNativeTableFixture } from '../../setupBrowser.js'

it('constructs an interface over the supplied grid and refuses competing row ownership', () => {
	const { root, element } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, grid)
	try {
		expect(binding).toBeInstanceOf(TableBinding)
		expect(binding.element).toBe(element)
		expect(binding.document).toBe(grid)
		expect(binding.destroyed).toBe(false)
		expect(() => createTableBinding(element, grid, { row: () => undefined })).toThrow(
			TableBindingError,
		)
	} finally {
		binding.destroy()
		root.remove()
	}
	expect(binding.destroyed).toBe(true)
	expect(grid.destroyed).toBe(false)
})
