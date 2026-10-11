import { expect, it } from 'vitest'
import { createTable } from '@src/core'
import { createTableBinding, readTable } from '@src/browser'

it('executes the native enhancement guide across core and browser', () => {
	const element = document.createElement('table')
	element.setAttribute('data-table-key', 'id')
	element.innerHTML =
		'<caption>People</caption><thead><tr><th data-table-column="id" data-table-cell="text">Reference</th><th data-table-column="name" data-table-cell="text"><button data-table-sort="name">Name</button></th></tr></thead><tbody><tr data-table-key="ash"><td data-table-column="name">Ash</td></tr><tr data-table-key="cedar"><td data-table-column="name">Cedar</td></tr></tbody>'
	document.body.append(element)
	const projection = readTable(element)
	const table = createTable(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, table)
	try {
		table.filter.set({ column: 'name', operator: 'contains', text: 'Ash' })
		binding.refresh()
		expect(element.tBodies[0]?.rows).toHaveLength(1)
		expect(element.tBodies[0]?.rows[0]?.getAttribute('data-table-key')).toBe('ash')
		binding.destroy()
		expect(element.tBodies[0]?.rows).toHaveLength(2)
		expect(table.destroyed).toBe(false)
	} finally {
		binding.destroy()
		element.remove()
	}
})
