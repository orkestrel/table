import { expect, it } from 'vitest'
import { matchesGridRow } from '@src/core'
import { requireValue } from '@orkestrel/test'
import { readTable, readTableRows, readTableSchema, TableBindingError } from '@src/browser'
import { createNativeTableFixture } from '../../setupBrowser.js'

it('projects typed cells, explicit identities, optional absence, and native data values', () => {
	const { root, element, body } = createNativeTableFixture(true)
	try {
		const row = requireValue(body.rows[0])
		requireValue(row.cells[2]).innerHTML = '<data value="31">Thirty one</data>'
		const projection = readTable(element)
		expect(projection.schema.key).toBe('id')
		expect(projection.rows[0]).toEqual({ id: 'cedar', name: 'Cedar', age: 31 })
		requireValue(row.cells[2]).remove()
		expect(readTableRows(projection.schema, [row])).toEqual([{ id: 'cedar', name: 'Cedar' }])
		expect(matchesGridRow(projection.rows[0], { age: 31, name: 'Cedar', id: 'cedar' })).toBe(true)
		expect(matchesGridRow(projection.rows[0], { name: 'Cedar', id: 'cedar' })).toBe(false)
		expect(matchesGridRow(undefined, { id: 'cedar' })).toBe(false)
	} finally {
		root.remove()
	}
})

it('rejects missing keys, repeated cells, invalid metadata, and undeclared cells without mutation', () => {
	const { root, element, body } = createNativeTableFixture(true)
	try {
		const row = requireValue(body.rows[0])
		const schema = readTableSchema(element)
		row.removeAttribute('data-table-key')
		expect(() => readTable(element)).toThrow(TableBindingError)
		row.setAttribute('data-table-key', 'cedar')
		const extra = row.insertCell()
		extra.setAttribute('data-table-column', 'age')
		extra.textContent = '33'
		expect(() => readTableRows(schema, [row])).toThrow(TableBindingError)
		extra.setAttribute('data-table-column', 'unknown')
		expect(() => readTableRows(schema, [row])).toThrow(TableBindingError)
		extra.remove()
		requireValue(element.tHead?.rows[0]?.cells[2]).setAttribute('data-table-cell', 'decimal')
		expect(() => readTableSchema(element)).toThrow(TableBindingError)
		expect(body.rows).toHaveLength(3)
	} finally {
		root.remove()
	}
})

it('reads declared flags and choices and refuses duplicate row keys', () => {
	const { root, element, body } = createNativeTableFixture()
	try {
		element.innerHTML =
			'<thead><tr><th data-table-column="id" data-table-cell="text">Id</th><th data-table-column="active" data-table-cell="flag">Active</th><th data-table-column="state" data-table-cell="choice" data-table-choices=\'[{"value":"ready","label":"Ready"}]\'>State</th></tr></thead><tbody><tr data-table-key="one"><td data-table-column="active">true</td><td data-table-column="state">ready</td></tr></tbody>'
		expect(readTable(element).rows).toEqual([{ id: 'one', active: true, state: 'ready' }])
		const actual = requireValue(element.tBodies[0])
		actual.append(requireValue(actual.rows[0]).cloneNode(true))
		expect(() => readTable(element)).toThrow(TableBindingError)
		expect(body.isConnected).toBe(false)
	} finally {
		root.remove()
	}
})
