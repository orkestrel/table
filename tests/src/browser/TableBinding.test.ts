import { createRecorder, requireValue, waitForCondition, waitForDelay } from '@orkestrel/test'
import { createGrid } from '@src/core'
import {
	createTableBinding,
	readTable,
	TableBindingError,
	isTableBindingError,
	type GridExpansion,
} from '@src/browser'
import { userEvent } from 'vitest/browser'
import { expect, it } from 'vitest'
import {
	CallbackControl,
	createNativeTableFixture,
	readTableFixtureKeys,
	renderTableFixtureDetail,
	renderTableFixtureRow,
} from '../../setupBrowser.js'

it('moves native pages by keyboard and hands focus across both bounds', async () => {
	const { root, element } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows, limit: 2 })
	const binding = createTableBinding(element, grid, { scope: root })
	try {
		const previous = requireValue(
			root.querySelector<HTMLButtonElement>('[data-table-move="previous"]'),
		)
		const next = requireValue(root.querySelector<HTMLButtonElement>('[data-table-move="next"]'))
		const limit = requireValue(root.querySelector<HTMLSelectElement>('[data-table-limit]'))
		expect(previous.disabled).toBe(true)
		expect(next.disabled).toBe(false)
		expect(limit.value).toBe('2')
		await userEvent.click(limit)
		await userEvent.keyboard('{Escape}')
		await userEvent.tab()
		expect(document.activeElement).toBe(next)
		await userEvent.keyboard('{Enter}')
		await waitForCondition('last page', () => next.disabled)
		expect(grid.pagination.page).toBe(2)
		expect(document.activeElement).toBe(previous)
		await userEvent.keyboard('{Enter}')
		await waitForCondition('first page', () => previous.disabled)
		expect(grid.pagination.page).toBe(1)
		expect(document.activeElement).toBe(next)
		grid.filter.set({ column: 'name', operator: 'contains', text: 'absent' })
		binding.refresh()
		expect(previous.disabled).toBe(true)
		expect(next.disabled).toBe(true)
		expect(document.activeElement).toBe(element)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('resizes through native controls and announces changed ranges only after clearing', async () => {
	const { root, element } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows, limit: 2 })
	const binding = createTableBinding(element, grid, { scope: root })
	const output = requireValue(root.querySelector('output'))
	const mutations = createRecorder<readonly [readonly MutationRecord[]]>()
	const observer = new MutationObserver(mutations.handler)
	try {
		await waitForCondition('initial range', () => output.value === '1 to 2 of 3')
		observer.observe(output, { childList: true, characterData: true, subtree: true })
		grid.selection.select('ash')
		grid.sort.set({ column: 'age', direction: 'ascending' })
		binding.refresh()
		await waitForDelay()
		expect(mutations.count).toBe(0)
		expect(observer.takeRecords()).toHaveLength(0)
		grid.pagination.move(2)
		binding.refresh()
		expect(output.value).toBe('')
		await waitForCondition('last range', () => output.value === '3 to 3 of 3')
		const limit = requireValue(root.querySelector<HTMLSelectElement>('[data-table-limit]'))
		await userEvent.selectOptions(limit, '1')
		await waitForCondition(
			'resized range',
			() => grid.pagination.limit === 1 && limit.value === '1',
		)
		expect(grid.pagination.page).toBe(3)
		await userEvent.selectOptions(limit, '')
		await waitForCondition('unpaged range', () => output.value === '1 to 3 of 3')
		expect(grid.pagination.limit).toBeUndefined()
		grid.filter.set({ column: 'name', operator: 'contains', text: 'absent' })
		binding.refresh()
		await waitForCondition('empty range', () => output.value === '0 to 0 of 0')
		grid.filter.remove()
		binding.refresh()
		binding.destroy()
		await waitForDelay()
		expect(output.value).toBe('Authored range')
		expect(limit.value).toBe('')
	} finally {
		observer.disconnect()
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('describes ranges and contains malformed limits and foreign controls', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows, limit: 2 })
	const errors = createRecorder()
	const binding = createTableBinding(element, grid, {
		scope: root,
		describe: {
			range: ({ first, last, count, page, pages }) => `${first}–${last}/${count}; ${page}/${pages}`,
		},
		on: { error: errors.handler },
	})
	try {
		const output = requireValue(root.querySelector('output'))
		await waitForCondition('localized range', () => output.value === '1–2/3; 1/2')
		const limit = requireValue(root.querySelector<HTMLSelectElement>('[data-table-limit]'))
		await userEvent.selectOptions(limit, 'invalid')
		expect(errors.count).toBe(1)
		expect(grid.pagination.limit).toBe(2)
		const nested = document.createElement('table')
		nested.innerHTML =
			'<caption><button data-table-move="next">Foreign page</button><button data-table-expand="page" aria-expanded="authored">Foreign details</button></caption>'
		requireValue(body.rows[0]).insertCell().append(nested)
		await userEvent.click(requireValue(nested.querySelector('button')))
		expect(grid.pagination.page).toBe(1)
		binding.refresh()
		expect(nested.querySelector('[data-table-expand]')?.getAttribute('aria-expanded')).toBe(
			'authored',
		)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('toggles only visible expansion keys with a fixed label and stable detail rows', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows, limit: 2 })
	grid.expansion.expand('birch')
	const binding = createTableBinding(element, grid, {
		scope: root,
		detail: renderTableFixtureDetail,
	})
	try {
		const button = requireValue(root.querySelector<HTMLButtonElement>('[data-table-expand="page"]'))
		expect(button.getAttribute('aria-expanded')).toBe('false')
		await userEvent.click(button)
		await waitForCondition('expanded page', () => button.getAttribute('aria-expanded') === 'true')
		expect([...grid.expansion.keys]).toEqual(['birch', 'cedar', 'ash'])
		expect(button.textContent).toBe('Page details')
		const detail = requireValue(body.rows[1])
		const id = detail.id
		await userEvent.keyboard('{Enter}')
		await waitForCondition('collapsed page', () => button.getAttribute('aria-expanded') === 'false')
		expect([...grid.expansion.keys]).toEqual(['birch'])
		expect(detail.isConnected).toBe(false)
		await userEvent.keyboard('{Enter}')
		await waitForCondition('retained detail', () => body.rows[1] === detail)
		expect(detail.id).toBe(id)
		grid.pagination.move(2)
		binding.refresh()
		expect(button.getAttribute('aria-expanded')).toBe('true')
		await userEvent.click(button)
		expect([...grid.expansion.keys]).toEqual(['cedar', 'ash'])
		grid.filter.set({ column: 'name', operator: 'contains', text: 'absent' })
		binding.refresh()
		expect(button.getAttribute('aria-expanded')).toBe('false')
		expect(button.disabled).toBe(true)
		binding.destroy()
		expect(button.hasAttribute('aria-expanded')).toBe(false)
		expect(button.disabled).toBe(false)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('emits one cancelable expand request per row and page toggle and changes nothing when prevented', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows, limit: 2 })
	const binding = createTableBinding(element, grid, {
		scope: root,
		detail: renderTableFixtureDetail,
	})
	const requests = createRecorder<readonly [readonly GridExpansion[], boolean]>()
	binding.emitter.on('expand', (event) => requests.handler(event.detail, event.cancelable))
	try {
		const page = requireValue(root.querySelector<HTMLButtonElement>('[data-table-expand="page"]'))
		const row = requireValue(body.rows[0]?.querySelector<HTMLButtonElement>('[data-table-expand]'))
		const before = Array.from(body.rows)
		binding.emitter.once('expand', (event) => event.preventDefault())
		await userEvent.click(row)
		binding.emitter.once('expand', (event) => event.preventDefault())
		await userEvent.click(page)
		expect(requests.calls).toEqual([
			[[{ key: 'cedar', expanded: true }], true],
			[
				[
					{ key: 'cedar', expanded: true },
					{ key: 'ash', expanded: true },
				],
				true,
			],
		])
		expect([...grid.expansion.keys]).toEqual([])
		expect(Array.from(body.rows)).toEqual(before)
		await userEvent.click(row)
		await waitForCondition('opened row', () => grid.expansion.keys.has('cedar'))
		await userEvent.click(page)
		await waitForCondition('opened page', () => grid.expansion.keys.has('ash'))
		await userEvent.click(page)
		await waitForCondition('closed page', () => grid.expansion.keys.size === 0)
		expect(requests.calls.slice(2)).toEqual([
			[[{ key: 'cedar', expanded: true }], true],
			[[{ key: 'ash', expanded: true }], true],
			[
				[
					{ key: 'cedar', expanded: false },
					{ key: 'ash', expanded: false },
				],
				true,
			],
		])
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('applies the announced state when a listener changes the key without preventing', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, grid)
	try {
		binding.emitter.once('expand', () => grid.expansion.expand('cedar'))
		await userEvent.click(
			requireValue(body.rows[0]?.querySelector<HTMLButtonElement>('[data-table-expand]')),
		)
		await waitForDelay(20)
		expect(grid.expansion.keys.has('cedar')).toBe(true)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('applies nothing when an expand listener destroys the binding', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, grid)
	try {
		binding.emitter.once('expand', () => binding.destroy())
		await userEvent.click(
			requireValue(body.rows[0]?.querySelector<HTMLButtonElement>('[data-table-expand]')),
		)
		expect(grid.expansion.keys.size).toBe(0)
		expect(grid.emitter.count()).toBe(0)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('ignores a click made from inside an expand listener', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, grid)
	const requests = createRecorder<readonly [readonly GridExpansion[]]>()
	binding.emitter.on('expand', (event) => requests.handler(event.detail))
	try {
		const row = requireValue(body.rows[0]?.querySelector<HTMLButtonElement>('[data-table-expand]'))
		binding.emitter.once('expand', () => row.click())
		await userEvent.click(row)
		await waitForCondition('opened row', () => grid.expansion.keys.has('cedar'))
		expect(requests.calls).toHaveLength(1)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('routes a throwing expand listener to the error option and still toggles', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const errors = createRecorder<readonly [unknown]>()
	const binding = createTableBinding(element, grid, { error: errors.handler })
	try {
		const refusal = new Error('refused')
		binding.emitter.once('expand', () => {
			throw refusal
		})
		await userEvent.click(
			requireValue(body.rows[0]?.querySelector<HTMLButtonElement>('[data-table-expand]')),
		)
		expect(errors.calls).toHaveLength(1)
		expect(errors.calls[0]?.[0]).toBe(refusal)
		await waitForCondition('opened row', () => grid.expansion.keys.has('cedar'))
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('describes sort priority through the binding option and clears removed orders', () => {
	const { root, element } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	grid.sort.set([
		{ column: 'age', direction: 'ascending' },
		{ column: 'name', direction: 'descending' },
	])
	const binding = createTableBinding(element, grid, {
		describe: {
			sort: ({ column, priority, count, direction }) =>
				`${column}: ${priority}/${count} ${direction}`,
		},
	})
	try {
		const button = requireValue(element.querySelector('[data-table-sort="name"]'))
		expect(button.getAttribute('aria-description')).toBe('name: 2/2 descending')
		grid.sort.remove('name')
		binding.refresh()
		expect(button.hasAttribute('aria-description')).toBe(false)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('clears repeated range wording, replaces pending pages, and preserves authored control edits on teardown', async () => {
	const { root, element } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows, limit: 1 })
	const descriptions = createRecorder<readonly [number]>()
	const binding = createTableBinding(element, grid, {
		scope: root,
		describe: {
			range: ({ page }) => {
				descriptions.handler(page)
				return 'Matching rows'
			},
		},
	})
	try {
		const output = requireValue(root.querySelector('output'))
		await waitForCondition('first wording', () => output.value === 'Matching rows')
		grid.pagination.move(2)
		binding.refresh()
		expect(output.value).toBe('')
		await waitForCondition('repeated wording', () => output.value === 'Matching rows')
		grid.pagination.move(3)
		binding.refresh()
		grid.pagination.move(1)
		binding.refresh()
		await waitForCondition('coalesced wording', () => output.value === 'Matching rows')
		expect(descriptions.calls.map(([page]) => page)).toEqual([1, 2, 3, 1])
		const previous = requireValue(
			root.querySelector<HTMLButtonElement>('[data-table-move="previous"]'),
		)
		expect(previous.disabled).toBe(true)
		output.value = 'Caller range'
		previous.disabled = false
		binding.destroy()
		expect(output.value).toBe('Caller range')
		expect(previous.disabled).toBe(false)
		await userEvent.click(
			requireValue(root.querySelector<HTMLButtonElement>('[data-table-move="next"]')),
		)
		expect(grid.pagination.page).toBe(1)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('contains formatter failures and retries without success or writes after destruction', async () => {
	const { root, element } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows, limit: 1 })
	const errors = createRecorder()
	const renders = createRecorder()
	const control = new CallbackControl(true)
	const binding = createTableBinding(element, grid, {
		scope: root,
		describe: {
			range: ({ page }) => {
				if (control.refused) throw new Error('Wording refused')
				if (control.stopped) binding.destroy()
				return `Page ${page}`
			},
		},
		on: { error: errors.handler, render: renders.handler },
	})
	try {
		const output = requireValue(root.querySelector('output'))
		expect(errors.count).toBe(1)
		expect(renders.count).toBe(0)
		expect(output.value).toBe('Authored range')
		control.accept()
		binding.refresh()
		await waitForCondition('retry wording', () => output.value === 'Page 1')
		control.stop()
		grid.pagination.move(2)
		binding.refresh()
		expect(binding.destroyed).toBe(true)
		await waitForDelay()
		expect(output.value).toBe('Authored range')
		expect(renders.count).toBe(1)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('does not fill a stale range when the formatter or a pending page changes the document', async () => {
	const { root, element } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows, limit: 1 })
	const binding = createTableBinding(element, grid, {
		scope: root,
		describe: {
			range: ({ page }) => {
				if (page === 1) grid.pagination.move(2)
				return `Page ${page}`
			},
		},
	})
	try {
		const output = requireValue(root.querySelector('output'))
		await waitForCondition('formatter move', () => output.value === 'Page 2')
		grid.pagination.move(1)
		binding.refresh()
		grid.pagination.move(3)
		await waitForCondition('pending move', () => output.value === 'Page 3')
		expect(grid.pagination.page).toBe(3)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('refills a range after a stale pending fill returns to the same page before refresh', async () => {
	const { root, element } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows, limit: 1 })
	const binding = createTableBinding(element, grid, { scope: root })
	const returning = setTimeout(() => grid.pagination.move(1), 0)
	try {
		grid.pagination.move(2)
		await waitForCondition(
			'returning range',
			() => root.querySelector('output')?.value === '1 to 1 of 3',
		)
		expect(grid.pagination.page).toBe(1)
	} finally {
		clearTimeout(returning)
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('cycles and cancels native sort requests while retaining nodes and multi-sort descriptions', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, grid)
	try {
		const original = Array.from(body.rows)
		const button = requireValue(
			element.querySelector<HTMLButtonElement>('[data-table-sort="name"]'),
		)
		binding.emitter.once('sort', (event) => event.preventDefault())
		await userEvent.click(button)
		expect(grid.sort.orders()).toEqual([])
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
		grid.sort.set([
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
	const grid = createGrid(projection.schema, {
		rows: [
			{ id: 'cedar', name: 'Cedar', age: 30 },
			{ id: 'ash', name: 'Ash', age: 20 },
			{ id: 'birch', name: 'Birch', age: 40 },
		],
		limit: 2,
	})
	const calls = createRecorder<readonly [string | number | boolean | undefined]>()
	const binding = createTableBinding(element, grid, {
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
		grid.selection.select('cedar')
		binding.refresh()
		expect(
			requireValue(root.querySelector<HTMLInputElement>('[data-table-page]')).indeterminate,
		).toBe(true)
		await userEvent.click(requireValue(root.querySelector<HTMLInputElement>('[data-table-page]')))
		expect([...grid.selection.keys]).toEqual(['cedar', 'ash'])
		grid.pagination.move(2)
		binding.refresh()
		await userEvent.click(requireValue(root.querySelector<HTMLInputElement>('[data-table-page]')))
		expect([...grid.selection.keys]).toEqual(['cedar', 'ash', 'birch'])
		await userEvent.click(requireValue(root.querySelector<HTMLInputElement>('[data-table-page]')))
		expect([...grid.selection.keys]).toEqual(['cedar', 'ash'])
		grid.pagination.move(1)
		binding.refresh()
		expect(body.rows[0]).toBe(cedar)
		expect(cedar.querySelector('button')).toBe(action)
		await userEvent.click(action)
		await waitForCondition('detail row', () => body.rows.length === 3)
		const detail = requireValue(body.rows[1])
		expect(detail.cells[0]?.colSpan).toBe(4)
		expect(action.getAttribute('aria-controls')).toBe(detail.id)
		grid.expansion.clear('cedar')
		binding.refresh()
		expect(detail.isConnected).toBe(false)
		expect(action.getAttribute('aria-expanded')).toBe('false')
		grid.expansion.expand('cedar')
		binding.refresh()
		expect(cedar.nextElementSibling).toBe(detail)
		grid.filter.set({ column: 'name', operator: 'contains', text: 'Ash' })
		binding.refresh()
		expect(readTableFixtureKeys(body)).toEqual(['ash'])
		expect(detail.isConnected).toBe(false)
		grid.filter.remove()
		grid.sort.set({ column: 'name', direction: 'ascending' })
		grid.pagination.resize()
		binding.refresh()
		expect(cedar.nextElementSibling).toBe(detail)
		expect(calls.count).toBe(3)
		expect(grid.rows.row('cedar')?.['age']).toBe(30)
		expect(cedar.cells[2]?.textContent).toBe('Thirty years')
		grid.rows.update({ id: 'cedar', name: 'Cedar changed' })
		binding.refresh()
		expect(calls.count).toBe(4)
		expect(detail.textContent).toBe('Details for Cedar changed')
		grid.rows.remove('cedar')
		binding.refresh()
		expect(cedar.isConnected).toBe(false)
		expect(detail.isConnected).toBe(false)
		grid.clear()
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
		const grid = createGrid(projection.schema, {
			rows: authored
				? projection.rows
				: [
						{ id: 'cedar', name: 'Cedar', age: 30 },
						{ id: 'ash', name: 'Ash', age: 20 },
					],
			limit: 1,
		})
		grid.selection.select('cedar')
		grid.expansion.expand('cedar')
		const binding = createTableBinding(element, grid, {
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
			grid.pagination.move(2)
			binding.refresh()
			expect(cedar.isConnected).toBe(false)
			grid.selection.clear()
			grid.expansion.clear()
			grid.pagination.move(1)
			binding.refresh()
			expect(body.rows[0]).toBe(cedar)
			expect(checkbox.checked).toBe(false)
			expect(button.getAttribute('aria-expanded')).toBe('false')
			expect(button.hasAttribute('aria-controls')).toBe(false)
			expect(nested.querySelector('input')?.checked).toBe(true)
			expect(nested.querySelector('button')?.getAttribute('aria-expanded')).toBe('authored')
		} finally {
			binding.destroy()
			grid.destroy()
			root.remove()
		}
	},
)

it('preserves retained authored focus while teardown restores store order and releases the binding', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, grid)
	const row = requireValue(body.rows[0])
	const button = requireValue(row.querySelector('button'))
	try {
		grid.sort.set({ column: 'name', direction: 'ascending' })
		binding.refresh()
		await userEvent.click(button)
		expect(document.activeElement).toBe(button)
		binding.destroy()
		expect(readTableFixtureKeys(body)).toEqual(['cedar', 'ash', 'birch'])
		expect(document.activeElement).toBe(button)
		expect(binding.emitter.destroyed).toBe(true)
		expect(grid.emitter.count()).toBe(0)
		expect(grid.destroyed).toBe(false)
		grid.sort.set({ column: 'name', direction: 'descending' })
		await waitForDelay(10)
		expect(readTableFixtureKeys(body)).toEqual(['cedar', 'ash', 'birch'])
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('retains an unrelated focus choice when a sort listener destroys the binding', async () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, grid)
	const outside = requireValue(root.querySelector<HTMLButtonElement>('[data-outside]'))
	try {
		grid.sort.set({ column: 'name', direction: 'ascending' })
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
		expect(grid.sort.orders()).toEqual([{ column: 'name', direction: 'ascending' }])
		expect(grid.emitter.count()).toBe(0)
	} finally {
		binding.destroy()
		grid.destroy()
		root.remove()
	}
})

it('preserves focused controls on sort and moves hidden-row focus to a named table', () => {
	const { root, element, body } = createNativeTableFixture(true)
	const projection = readTable(element)
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const binding = createTableBinding(element, grid)
	try {
		const row = requireValue(body.rows[0])
		const button = requireValue(row.querySelector('button'))
		button.focus()
		grid.sort.set({ column: 'name', direction: 'ascending' })
		binding.refresh()
		expect(document.activeElement).toBe(button)
		grid.filter.set({ column: 'name', operator: 'contains', text: 'Ash' })
		binding.refresh()
		expect(document.activeElement).toBe(element)
		const outside = requireValue(root.querySelector<HTMLButtonElement>('[data-outside]'))
		outside.focus()
		grid.filter.remove()
		binding.refresh()
		expect(document.activeElement).toBe(outside)
		expect(body.rows[2]).toBe(row)
		button.focus()
		grid.pagination.resize(1)
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
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const errors = createRecorder()
	const binding = createTableBinding(element, grid, { on: { error: errors.handler } })
	try {
		const cedar = requireValue(body.rows[0])
		grid.selection.select('cedar')
		grid.expansion.expand('cedar')
		requireValue(cedar.querySelector('[data-table-column="age"]')).remove()
		await waitForCondition(
			'optional cell removed',
			() => grid.rows.row('cedar')?.['age'] === undefined,
		)
		expect(grid.selection.keys.has('cedar')).toBe(true)
		expect(grid.expansion.keys.has('cedar')).toBe(true)
		grid.filter.set({ column: 'name', operator: 'contains', text: 'Ash' })
		binding.refresh()
		requireValue(cedar.querySelector('[data-table-column="name"]')).textContent = 'Cedar edited'
		await waitForCondition(
			'detached edit reaches core',
			() => grid.rows.row('cedar')?.['name'] === 'Cedar edited',
		)
		grid.filter.remove()
		binding.refresh()
		const added = body.insertRow()
		added.setAttribute('data-table-key', 'elm')
		renderTableFixtureRow(added, { id: 'elm', name: 'Elm', age: 50 })
		await waitForCondition('added row reaches core', () => grid.rows.row('elm') !== undefined)
		const duplicate = added.cloneNode(true)
		body.append(duplicate)
		requireValue(added.querySelector('[data-table-column="age"]')).textContent = 'invalid'
		await waitForCondition('invalid batch surfaced', () => errors.count > 0)
		expect(grid.rows.row('elm')?.['age']).toBe(50)
		duplicate.parentNode?.removeChild(duplicate)
		requireValue(added.querySelector('[data-table-column="age"]')).textContent = '51'
		await waitForCondition(
			'corrected value reaches core',
			() => grid.rows.row('elm')?.['age'] === 51,
		)
		added.remove()
		await waitForCondition('removed row leaves core', () => grid.rows.row('elm') === undefined)
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
	const grid = createGrid(readTable(element).schema, {
		rows: [{ id: 'ash', name: 'Ash', age: 20 }],
	})
	const errors = createRecorder()
	const renders = createRecorder()
	const control = new CallbackControl(true)
	const binding = createTableBinding(element, grid, {
		row: (node, row) => {
			if (control.refused) throw new Error('Renderer refusal')
			renderTableFixtureRow(node, row)
			if (row['age'] === 20) grid.rows.update({ id: 'ash', age: 21 })
		},
		on: { error: errors.handler, render: renders.handler },
	})
	try {
		expect(errors.count).toBe(1)
		expect(renders.count).toBe(0)
		control.accept()
		binding.refresh()
		await waitForCondition(
			'reentrant final value rendered',
			() => body.rows[0]?.cells[2]?.textContent === '21',
		)
		expect(renders.count).toBe(2)
		grid.rows.update({ id: 'ash', age: 22 })
		binding.destroy()
		await waitForDelay(10)
		expect(body.rows[0]?.cells[2]?.textContent).toBe('21')
		expect(grid.destroyed).toBe(false)
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
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const header = requireValue(element.tHead?.rows[0]?.cells[1])
	header.setAttribute('aria-sort', 'other')
	const binding = createTableBinding(element, grid, { scope: root })
	try {
		await userEvent.click(requireValue(nested.querySelector('button')))
		await userEvent.click(requireValue(nested.querySelector('input')))
		expect(grid.sort.orders()).toEqual([])
		expect(grid.selection.keys.size).toBe(0)
		grid.sort.set({ column: 'name', direction: 'ascending' })
		grid.pagination.resize(1)
		binding.refresh()
		binding.destroy()
		expect(readTableFixtureKeys(body)).toEqual(['cedar', 'ash', 'birch'])
		expect(header.getAttribute('aria-sort')).toBe('other')
		expect(grid.emitter.count()).toBe(0)
		expect(binding.emitter.destroyed).toBe(true)
		expect(grid.destroyed).toBe(false)
		grid.rows.update({ id: 'cedar', age: 31 })
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
	const grid = createGrid(projection.schema, { rows: projection.rows })
	const cedar = requireValue(body.rows[0])
	const name = requireValue(cedar.querySelector('[data-table-column="name"]'))
	const binding = createTableBinding(element, grid, {
		detail: (node, row) => {
			renderTableFixtureDetail(node, row)
			if (row['name'] === 'Cedar') name.textContent = 'Cedar from detail'
		},
	})
	try {
		grid.sort.set({ column: 'name', direction: 'ascending' })
		requireValue(cedar.querySelector('[data-table-column="age"]')).textContent = '35'
		grid.expansion.expand('cedar')
		binding.refresh()
		await waitForCondition(
			'callback edit survives binding movement',
			() => grid.rows.row('cedar')?.['name'] === 'Cedar from detail',
		)
		expect(grid.rows.row('cedar')?.['age']).toBe(35)
		expect(cedar.nextElementSibling?.textContent).toBe('Details for Cedar from detail')
	} finally {
		binding.destroy()
		root.remove()
	}
})

it('yields refresh from render listeners and stops a renderer continuation after destruction', async () => {
	const { root, element, body } = createNativeTableFixture()
	const grid = createGrid(readTable(element).schema, {
		rows: [{ id: 'ash', name: 'Ash', age: 20 }],
	})
	const control = new CallbackControl()
	const binding = createTableBinding(element, grid, {
		row: (node, row) => {
			renderTableFixtureRow(node, row)
			if (control.stopped) binding.destroy()
		},
	})
	try {
		const renders = createRecorder()
		binding.emitter.on('render', renders.handler)
		binding.emitter.once('render', () => binding.refresh())
		binding.refresh()
		expect(renders.count).toBe(1)
		await waitForCondition('listener refresh yields', () => renders.count === 2)
		control.stop()
		grid.rows.update({ id: 'ash', age: 21 })
		binding.refresh()
		expect(binding.destroyed).toBe(true)
		expect(renders.count).toBe(2)
		const final = body.innerHTML
		grid.rows.update({ id: 'ash', age: 22 })
		await waitForDelay(10)
		expect(body.innerHTML).toBe(final)
		expect(grid.destroyed).toBe(false)
	} finally {
		binding.destroy()
		root.remove()
	}
})
