import { expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { requireValue, waitForCondition } from '@orkestrel/test'
import { createGrid } from '@src/core'
import { createTableBinding, readTable } from '@src/browser'

it('executes the scoped pager and expansion guide through native controls', async () => {
	const scope = document.createElement('section')
	scope.innerHTML =
		'<table data-table-key="id"><caption>Accounts</caption><thead><tr><th data-table-column="id" data-table-cell="text"><button data-table-sort="id">Account</button></th></tr></thead><tbody><tr data-table-key="ash"><td data-table-column="id">ash</td></tr><tr data-table-key="cedar"><td data-table-column="id">cedar</td></tr></tbody></table><nav aria-label="Account pages"><output data-table-range></output><select aria-label="Rows per page" data-table-limit><option value="1">1</option><option value="">All</option></select><button type="button" data-table-move="previous">Previous</button><button type="button" data-table-move="next">Next</button><button type="button" data-table-expand="page">Page details</button></nav>'
	document.body.append(scope)
	const element = scope.querySelector('table')
	if (element === null) throw new Error('Missing account table')
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows, limit: 1 })
	const binding = createTableBinding(element, grid, {
		scope,
		describe: {
			range: ({ first, last, count }) => `${first}–${last} of ${count} accounts`,
			sort: ({ priority, count, direction }) => `Order ${priority}/${count}: ${direction}`,
		},
		detail: (node, row) => {
			const cell = node.cells[0]
			if (cell !== undefined) cell.textContent = `Account ${row['id']}`
		},
	})
	try {
		const output = requireValue(scope.querySelector('output'))
		await waitForCondition('guide initial range', () => output.value === '1–1 of 2 accounts')
		await userEvent.click(
			requireValue(scope.querySelector<HTMLButtonElement>('[data-table-move="next"]')),
		)
		await waitForCondition('guide last range', () => output.value === '2–2 of 2 accounts')
		expect(document.activeElement).toBe(scope.querySelector('[data-table-move="previous"]'))
		await userEvent.click(
			requireValue(scope.querySelector<HTMLButtonElement>('[data-table-expand="page"]')),
		)
		await waitForCondition(
			'guide detail',
			() => element.tBodies[0]?.rows[1]?.textContent === 'Account cedar',
		)
		expect([...grid.expansion.keys]).toEqual(['cedar'])
		const sort = requireValue(scope.querySelector<HTMLButtonElement>('[data-table-sort]'))
		await userEvent.click(sort)
		await waitForCondition(
			'guide sort wording',
			() => sort.getAttribute('aria-description') === 'Order 1/1: ascending',
		)
	} finally {
		binding.destroy()
		grid.destroy()
		scope.remove()
	}
})

it('executes the native enhancement guide across core and browser', () => {
	const element = document.createElement('table')
	element.setAttribute('data-table-key', 'id')
	element.innerHTML =
		'<caption>People</caption><thead><tr><th data-table-column="id" data-table-cell="text">Reference</th><th data-table-column="name" data-table-cell="text"><button data-table-sort="name">Name</button></th></tr></thead><tbody><tr data-table-key="ash"><td data-table-column="name">Ash</td></tr><tr data-table-key="cedar"><td data-table-column="name">Cedar</td></tr></tbody>'
	document.body.append(element)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, grid)
	try {
		grid.filter.set({ column: 'name', operator: 'contains', text: 'Ash' })
		binding.refresh()
		expect(element.tBodies[0]?.rows).toHaveLength(1)
		expect(element.tBodies[0]?.rows[0]?.getAttribute('data-table-key')).toBe('ash')
		binding.destroy()
		expect(element.tBodies[0]?.rows).toHaveLength(2)
		expect(grid.destroyed).toBe(false)
	} finally {
		binding.destroy()
		element.remove()
	}
})
