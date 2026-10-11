import { expect, it } from 'vitest'
import { createTable } from '@src/core'
import { createTableBinding, readTable, TableBinding, TableBindingError } from '@src/browser'
import { createNativeTableFixture } from '../../setupBrowser.js'

it('constructs an interface over the supplied table and refuses competing row ownership', () => {
	const { root, element } = createNativeTableFixture(true)
	const projection = readTable(element)
	const table = createTable(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, table)
	try {
		expect(binding).toBeInstanceOf(TableBinding)
		expect(binding.element).toBe(element)
		expect(binding.document).toBe(table)
		expect(binding.destroyed).toBe(false)
		expect(() => createTableBinding(element, table, { row: () => undefined })).toThrow(
			TableBindingError,
		)
	} finally {
		binding.destroy()
		root.remove()
	}
	expect(binding.destroyed).toBe(true)
	expect(table.destroyed).toBe(false)
})
