import { createRecorder, requireValue, waitForCondition, waitForDelay } from '@orkestrel/test'
import { createTable } from '@src/core'
import { createTableBinding, readTable, TableBindingError, isTableBindingError } from '@src/browser'
import { userEvent } from 'vitest/browser'
import { expect, it } from 'vitest'
import {
	createNativeTableFixture,
	readTableFixtureKeys,
	renderTableFixtureDetail,
	renderTableFixtureRow,
} from '../../setupBrowser.js'

it('cycles and cancels native sort requests while retaining nodes and multi-sort descriptions', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const table = createTable(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, table)
	try {
		const original = Array.from(body.rows)
		const button = requireValue(
			element.querySelector<HTMLButtonElement>('[data-table-sort="name"]'),
		)
		binding.emitter.once('sort', (event) => event.preventDefault())
		await userEvent.click(button)
		expect(table.sort.orders()).toEqual([])
		await userEvent.click(button)
		await waitForCondition('ascending rows', () => body.rows[0] === original[1])
		expect(readTableFixtureKeys(body)).toEqual(['ash', 'birch', 'cedar'])
		expect(button.closest('th')?.getAttribute('aria-sort')).toBe('ascending')
		await userEvent.click(button)
		await waitForCondition('descending rows', () => body.rows[0] === original[0])
		expect(readTableFixtureKeys(body)).toEqual(['cedar', 'birch', 'ash'])
		await userEvent.click(button)
		await waitForCondition('store order', () => body.rows[1] === original[1])
		expect(Array.from(body.rows)).toEqual(original)
		table.sort.set([
			{ column: 'age', direction: 'ascending' },
			{ column: 'name', direction: 'descending' },
		])
		binding.refresh()
		expect(button.getAttribute('aria-description')).toBe('Sort priority 2 of 2, descending')
		expect(element.querySelectorAll('[aria-sort]')).toHaveLength(1)
	} finally {
		binding.destroy()
		root.remove()
	}
})

it('projects every manager with page-scoped selection, retained details, and value-only callbacks', async () => {
	const { root, element, body } = createNativeTableFixture()
	const projection = readTable(element)
	const table = createTable(projection.schema, {
		rows: [
			{ id: 'cedar', name: 'Cedar', age: 30 },
			{ id: 'ash', name: 'Ash', age: 20 },
			{ id: 'birch', name: 'Birch', age: 40 },
		],
		limit: 2,
	})
	const calls = createRecorder<readonly [string | number | boolean | undefined]>()
	const binding = createTableBinding(element, table, {
		scope: root,
		row: (node, row) => {
			calls.handler(row['id'])
			renderTableFixtureRow(node, row)
		},
		detail: renderTableFixtureDetail,
	})
	try {
		const cedar = requireValue(body.rows[0])
		const action = requireValue(cedar.querySelector('button'))
		requireValue(cedar.cells[2]).textContent = 'Thirty years'
		table.selection.select('cedar')
		binding.refresh()
		expect(
			requireValue(root.querySelector<HTMLInputElement>('[data-table-page]')).indeterminate,
		).toBe(true)
		await userEvent.click(requireValue(root.querySelector<HTMLInputElement>('[data-table-page]')))
		expect([...table.selection.keys]).toEqual(['cedar', 'ash'])
		table.pagination.move(2)
		binding.refresh()
		await userEvent.click(requireValue(root.querySelector<HTMLInputElement>('[data-table-page]')))
		expect([...table.selection.keys]).toEqual(['cedar', 'ash', 'birch'])
		await userEvent.click(requireValue(root.querySelector<HTMLInputElement>('[data-table-page]')))
		expect([...table.selection.keys]).toEqual(['cedar', 'ash'])
		table.pagination.move(1)
		binding.refresh()
		expect(body.rows[0]).toBe(cedar)
		expect(cedar.querySelector('button')).toBe(action)
		await userEvent.click(action)
		await waitForCondition('detail row', () => body.rows.length === 3)
		const detail = requireValue(body.rows[1])
		expect(detail.cells[0]?.colSpan).toBe(4)
		expect(action.getAttribute('aria-controls')).toBe(detail.id)
		table.expansion.clear('cedar')
		binding.refresh()
		expect(detail.isConnected).toBe(false)
		expect(action.getAttribute('aria-expanded')).toBe('false')
		table.expansion.expand('cedar')
		binding.refresh()
		expect(cedar.nextElementSibling).toBe(detail)
		table.filter.set({ column: 'name', operator: 'contains', text: 'Ash' })
		binding.refresh()
		expect(readTableFixtureKeys(body)).toEqual(['ash'])
		expect(detail.isConnected).toBe(false)
		table.filter.remove()
		table.sort.set({ column: 'name', direction: 'ascending' })
		table.pagination.resize()
		binding.refresh()
		expect(cedar.nextElementSibling).toBe(detail)
		expect(calls.count).toBe(3)
		expect(table.rows.row('cedar')?.['age']).toBe(30)
		expect(cedar.cells[2]?.textContent).toBe('Thirty years')
		table.rows.update({ id: 'cedar', name: 'Cedar changed' })
		binding.refresh()
		expect(calls.count).toBe(4)
		expect(detail.textContent).toBe('Details for Cedar changed')
		table.rows.remove('cedar')
		binding.refresh()
		expect(cedar.isConnected).toBe(false)
		expect(detail.isConnected).toBe(false)
		table.clear()
		binding.refresh()
		expect(body.rows).toHaveLength(0)
	} finally {
		binding.destroy()
		root.remove()
	}
})

it.each([true, false])(
	'projects initial and returning selection and expansion on authored=%s rows without touching nested controls',
	(authored) => {
		const { root, element, body } = createNativeTableFixture(authored)
		const projection = readTable(element)
		const table = createTable(projection.schema, {
			rows: authored
				? projection.rows
				: [
						{ id: 'cedar', name: 'Cedar', age: 30 },
						{ id: 'ash', name: 'Ash', age: 20 },
					],
			limit: 1,
		})
		table.selection.select('cedar')
		table.expansion.expand('cedar')
		const binding = createTableBinding(element, table, {
			...(authored ? {} : { row: renderTableFixtureRow }),
			detail: renderTableFixtureDetail,
		})
		try {
			const cedar = requireValue(body.rows[0])
			const checkbox = requireValue(
				cedar.querySelector<HTMLInputElement>('input[data-table-select]'),
			)
			const button = requireValue(cedar.querySelector('button[data-table-expand]'))
			expect(checkbox.checked).toBe(true)
			expect(button.getAttribute('aria-expanded')).toBe('true')
			expect(button.getAttribute('aria-controls')).toBe(body.rows[1]?.id)
			const nested = document.createElement('table')
			nested.innerHTML =
				'<caption><input type="checkbox" data-table-select checked><button data-table-expand aria-expanded="authored">Nested</button></caption>'
			cedar.insertCell().append(nested)
			table.pagination.move(2)
			binding.refresh()
			expect(cedar.isConnected).toBe(false)
			table.selection.clear()
			table.expansion.clear()
			table.pagination.move(1)
			binding.refresh()
			expect(body.rows[0]).toBe(cedar)
			expect(checkbox.checked).toBe(false)
			expect(button.getAttribute('aria-expanded')).toBe('false')
			expect(button.hasAttribute('aria-controls')).toBe(false)
			expect(nested.querySelector('input')?.checked).toBe(true)
			expect(nested.querySelector('button')?.getAttribute('aria-expanded')).toBe('authored')
		} finally {
			binding.destroy()
			table.destroy()
			root.remove()
		}
	},
)

it('preserves retained authored focus while teardown restores store order and releases the binding', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const table = createTable(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, table)
	const row = requireValue(body.rows[0])
	const button = requireValue(row.querySelector('button'))
	try {
		table.sort.set({ column: 'name', direction: 'ascending' })
		binding.refresh()
		await userEvent.click(button)
		expect(document.activeElement).toBe(button)
		binding.destroy()
		expect(readTableFixtureKeys(body)).toEqual(['cedar', 'ash', 'birch'])
		expect(document.activeElement).toBe(button)
		expect(binding.emitter.destroyed).toBe(true)
		expect(table.emitter.count()).toBe(0)
		expect(table.destroyed).toBe(false)
		table.sort.set({ column: 'name', direction: 'descending' })
		await waitForDelay(10)
		expect(readTableFixtureKeys(body)).toEqual(['cedar', 'ash', 'birch'])
	} finally {
		binding.destroy()
		table.destroy()
		root.remove()
	}
})

it('retains an unrelated focus choice when a sort listener destroys the binding', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const table = createTable(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, table)
	const outside = requireValue(root.querySelector<HTMLButtonElement>('[data-outside]'))
	try {
		table.sort.set({ column: 'name', direction: 'ascending' })
		binding.refresh()
		binding.emitter.once('sort', () => {
			outside.focus()
			binding.destroy()
		})
		await userEvent.click(
			requireValue(element.querySelector<HTMLButtonElement>('[data-table-sort="name"]')),
		)
		expect(document.activeElement).toBe(outside)
		expect(readTableFixtureKeys(body)).toEqual(['cedar', 'ash', 'birch'])
		expect(table.sort.orders()).toEqual([{ column: 'name', direction: 'ascending' }])
		expect(table.emitter.count()).toBe(0)
	} finally {
		binding.destroy()
		table.destroy()
		root.remove()
	}
})

it('preserves focused controls on sort and moves hidden-row focus to a named table', () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const table = createTable(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, table)
	try {
		const row = requireValue(body.rows[0])
		const button = requireValue(row.querySelector('button'))
		button.focus()
		table.sort.set({ column: 'name', direction: 'ascending' })
		binding.refresh()
		expect(document.activeElement).toBe(button)
		table.filter.set({ column: 'name', operator: 'contains', text: 'Ash' })
		binding.refresh()
		expect(document.activeElement).toBe(element)
		const outside = requireValue(root.querySelector<HTMLButtonElement>('[data-outside]'))
		outside.focus()
		table.filter.remove()
		binding.refresh()
		expect(document.activeElement).toBe(outside)
		expect(body.rows[2]).toBe(row)
		button.focus()
		table.pagination.resize(1)
		binding.refresh()
		expect(document.activeElement).toBe(element)
	} finally {
		binding.destroy()
		root.remove()
	}
})

it('admits external rows and cells atomically, observes detached rows, and keeps key state on cell omission', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const table = createTable(projection.schema, { rows: projection.rows })
	const errors = createRecorder()
	const binding = createTableBinding(element, table, { on: { error: errors.handler } })
	try {
		const cedar = requireValue(body.rows[0])
		table.selection.select('cedar')
		table.expansion.expand('cedar')
		requireValue(cedar.querySelector('[data-table-column="age"]')).remove()
		await waitForCondition(
			'optional cell removed',
			() => table.rows.row('cedar')?.['age'] === undefined,
		)
		expect(table.selection.keys.has('cedar')).toBe(true)
		expect(table.expansion.keys.has('cedar')).toBe(true)
		table.filter.set({ column: 'name', operator: 'contains', text: 'Ash' })
		binding.refresh()
		requireValue(cedar.querySelector('[data-table-column="name"]')).textContent = 'Cedar edited'
		await waitForCondition(
			'detached edit reaches core',
			() => table.rows.row('cedar')?.['name'] === 'Cedar edited',
		)
		table.filter.remove()
		binding.refresh()
		const added = body.insertRow()
		added.setAttribute('data-table-key', 'elm')
		renderTableFixtureRow(added, { id: 'elm', name: 'Elm', age: 50 })
		await waitForCondition('added row reaches core', () => table.rows.row('elm') !== undefined)
		const duplicate = added.cloneNode(true)
		body.append(duplicate)
		requireValue(added.querySelector('[data-table-column="age"]')).textContent = 'invalid'
		await waitForCondition('invalid batch surfaced', () => errors.count > 0)
		expect(table.rows.row('elm')?.['age']).toBe(50)
		duplicate.parentNode?.removeChild(duplicate)
		requireValue(added.querySelector('[data-table-column="age"]')).textContent = '51'
		await waitForCondition(
			'corrected value reaches core',
			() => table.rows.row('elm')?.['age'] === 51,
		)
		added.remove()
		await waitForCondition('removed row leaves core', () => table.rows.row('elm') === undefined)
		binding.refresh()
		const renders = createRecorder()
		binding.emitter.on('render', renders.handler)
		requireValue(added.querySelector('[data-table-column="age"]')).textContent = '52'
		await waitForDelay(10)
		expect(renders.count).toBe(0)
	} finally {
		binding.destroy()
		root.remove()
	}
})

it('reports failed callbacks without success, retries explicitly, and yields reentrant writes', async () => {
	const { root, element, body } = createNativeTableFixture()
	const table = createTable(readTable(element).schema, {
		rows: [{ id: 'ash', name: 'Ash', age: 20 }],
	})
	const errors = createRecorder()
	const renders = createRecorder()
	let refused = true
	const binding = createTableBinding(element, table, {
		row: (node, row) => {
			if (refused) throw new Error('Renderer refusal')
			renderTableFixtureRow(node, row)
			if (row['age'] === 20) table.rows.update({ id: 'ash', age: 21 })
		},
		on: { error: errors.handler, render: renders.handler },
	})
	try {
		expect(errors.count).toBe(1)
		expect(renders.count).toBe(0)
		refused = false
		binding.refresh()
		await waitForCondition(
			'reentrant final value rendered',
			() => body.rows[0]?.cells[2]?.textContent === '21',
		)
		expect(renders.count).toBe(2)
		table.rows.update({ id: 'ash', age: 22 })
		binding.destroy()
		await waitForDelay(10)
		expect(body.rows[0]?.cells[2]?.textContent).toBe('21')
		expect(table.destroyed).toBe(false)
	} finally {
		binding.destroy()
		root.remove()
	}
})

it('ignores nested hooks, restores owned attributes, and releases subscriptions', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const node = requireValue(body.rows[0])
	const nested = document.createElement('table')
	const cell = node.insertCell()
	cell.append(nested)
	nested.innerHTML =
		'<thead><tr><th><button data-table-sort="name">Nested</button></th></tr></thead><tbody><tr><td><input type="checkbox" data-table-page data-table-select></td></tr></tbody>'
	const projection = readTable(element)
	const table = createTable(projection.schema, { rows: projection.rows })
	const header = requireValue(element.tHead?.rows[0]?.cells[1])
	header.setAttribute('aria-sort', 'other')
	const binding = createTableBinding(element, table, { scope: root })
	try {
		await userEvent.click(requireValue(nested.querySelector('button')))
		await userEvent.click(requireValue(nested.querySelector('input')))
		expect(table.sort.orders()).toEqual([])
		expect(table.selection.keys.size).toBe(0)
		table.sort.set({ column: 'name', direction: 'ascending' })
		table.pagination.resize(1)
		binding.refresh()
		binding.destroy()
		expect(readTableFixtureKeys(body)).toEqual(['cedar', 'ash', 'birch'])
		expect(header.getAttribute('aria-sort')).toBe('other')
		expect(table.emitter.count()).toBe(0)
		expect(binding.emitter.destroyed).toBe(true)
		expect(table.destroyed).toBe(false)
		table.rows.update({ id: 'cedar', age: 31 })
		expect(node.cells[2]?.textContent).toBe('30')
		expect(isTableBindingError(new TableBindingError('STRUCTURE', 'bad'))).toBe(true)
		expect(isTableBindingError({ code: 'STRUCTURE' })).toBe(false)
	} finally {
		binding.destroy()
		root.remove()
	}
})

it('does not lose external cell writes made beside a reorder or inside a detail callback', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const table = createTable(projection.schema, { rows: projection.rows })
	const cedar = requireValue(body.rows[0])
	const name = requireValue(cedar.querySelector('[data-table-column="name"]'))
	const binding = createTableBinding(element, table, {
		detail: (node, row) => {
			renderTableFixtureDetail(node, row)
			if (row['name'] === 'Cedar') name.textContent = 'Cedar from detail'
		},
	})
	try {
		table.sort.set({ column: 'name', direction: 'ascending' })
		requireValue(cedar.querySelector('[data-table-column="age"]')).textContent = '35'
		table.expansion.expand('cedar')
		binding.refresh()
		await waitForCondition(
			'callback edit survives binding movement',
			() => table.rows.row('cedar')?.['name'] === 'Cedar from detail',
		)
		expect(table.rows.row('cedar')?.['age']).toBe(35)
		expect(cedar.nextElementSibling?.textContent).toBe('Details for Cedar from detail')
	} finally {
		binding.destroy()
		root.remove()
	}
})

it('yields refresh from render listeners and stops a renderer continuation after destruction', async () => {
	const { root, element, body } = createNativeTableFixture()
	const table = createTable(readTable(element).schema, {
		rows: [{ id: 'ash', name: 'Ash', age: 20 }],
	})
	let stop = false
	const binding = createTableBinding(element, table, {
		row: (node, row) => {
			renderTableFixtureRow(node, row)
			if (stop) binding.destroy()
		},
	})
	try {
		const renders = createRecorder()
		binding.emitter.on('render', renders.handler)
		binding.emitter.once('render', () => binding.refresh())
		binding.refresh()
		expect(renders.count).toBe(1)
		await waitForCondition('listener refresh yields', () => renders.count === 2)
		stop = true
		table.rows.update({ id: 'ash', age: 21 })
		binding.refresh()
		expect(binding.destroyed).toBe(true)
		expect(renders.count).toBe(2)
		const final = body.innerHTML
		table.rows.update({ id: 'ash', age: 22 })
		await waitForDelay(10)
		expect(body.innerHTML).toBe(final)
		expect(table.destroyed).toBe(false)
	} finally {
		binding.destroy()
		root.remove()
	}
})
