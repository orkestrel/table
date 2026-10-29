import type { TableRow } from '@src/core'
import { requireValue } from '@orkestrel/test'
import { render } from '@orkestrel/test/browser'

/** Creates a connected, explicitly keyed native table and its scoped page control.
 * @param authored - Whether to seed native rows.
 * @returns The connected fixture nodes.
 */
export function createNativeTableFixture(authored = false) {
	const root = render(
		'<section><label><input type="checkbox" data-table-page> Select page</label><button data-outside>Filter</button><table data-table-key="id"><caption>People</caption><thead><tr><th data-table-column="id" data-table-cell="text">Reference</th><th data-table-column="name" data-table-cell="text"><button data-table-sort="name">Name</button></th><th data-table-column="age" data-table-cell="number"><button data-table-sort="age">Age</button></th><th>Actions</th></tr></thead><tbody></tbody></table></section>',
	)
	document.body.append(root)
	root.insertAdjacentHTML(
		'beforeend',
		'<nav aria-label="People pages"><output data-table-range>Authored range</output><select aria-label="Rows per page" data-table-limit><option value="">All</option><option value="1">1</option><option value="2">2</option><option value="invalid">Invalid</option></select><button type="button" data-table-move="previous">Previous</button><button type="button" data-table-move="next">Next</button><button type="button" data-table-expand="page">Page details</button></nav>',
	)
	const element = requireValue(root.querySelector('table'))
	const body = requireValue(element.tBodies[0])
	if (authored) {
		for (const row of [
			{ id: 'cedar', name: 'Cedar', age: 30 },
			{ id: 'ash', name: 'Ash', age: 20 },
			{ id: 'birch', name: 'Birch', age: 40 },
		]) {
			const node = body.insertRow()
			node.setAttribute('data-table-key', row.id)
			renderTableFixtureRow(node, row)
		}
	}
	return { root, element, body }
}

/** Patches fixture cells while retaining its checkbox and action button.
 * @param element - The retained data row.
 * @param row - The value to present.
 */
export function renderTableFixtureRow(element: HTMLTableRowElement, row: TableRow): void {
	if (element.cells.length === 0) {
		for (const column of ['id', 'name', 'age'])
			element.insertCell().setAttribute('data-table-column', column)
		element.insertCell().innerHTML =
			'<label><input type="checkbox" data-table-select> Select</label><button data-table-expand>Details</button>'
	}
	for (const cell of element.cells) {
		const column = cell.getAttribute('data-table-column')
		if (column !== null) cell.textContent = String(row[column] ?? '')
	}
}

/** Patches a binding-owned detail cell.
 * @param element - The supplied detail row.
 * @param row - The associated value.
 */
export function renderTableFixtureDetail(element: HTMLTableRowElement, row: TableRow): void {
	requireValue(element.cells[0]).textContent = `Details for ${row['name']}`
}

/** Reads data-row identities without counting generated detail rows.
 * @param body - The fixture body.
 * @returns Visible data keys.
 */
export function readTableFixtureKeys(body: HTMLTableSectionElement): readonly string[] {
	return Array.from(body.rows).flatMap((row) => {
		const key = row.getAttribute('data-table-key')
		return key === null ? [] : [key]
	})
}

/** Controls callback refusal and stop observations in binding tests. */
export class CallbackControl {
	#refused: boolean
	#stopped = false

	constructor(refused = false) {
		this.#refused = refused
	}

	get refused(): boolean {
		return this.#refused
	}

	get stopped(): boolean {
		return this.#stopped
	}

	accept(): void {
		this.#refused = false
	}

	stop(): void {
		this.#stopped = true
	}
}
