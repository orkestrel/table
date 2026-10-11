import { expect, it } from 'vitest'
import { requireValue } from '@orkestrel/test'
import {
	createNativeTableFixture,
	readTableFixtureKeys,
	renderTableFixtureDetail,
	renderTableFixtureRow,
} from './setupBrowser.js'

it('builds connected fixtures and patches values without replacing actions', () => {
	const { root, body, element } = createNativeTableFixture(true)
	try {
		expect(element.isConnected).toBe(true)
		expect(readTableFixtureKeys(body)).toEqual(['cedar', 'ash', 'birch'])
		const row = requireValue(body.rows[0])
		const button = row.querySelector('button')
		renderTableFixtureRow(row, { id: 'cedar', name: 'Updated', age: 32 })
		expect(row.cells[1]?.textContent).toBe('Updated')
		expect(row.querySelector('button')).toBe(button)
		const detail = body.insertRow()
		detail.insertCell()
		renderTableFixtureDetail(detail, { id: 'cedar', name: 'Updated' })
		expect(detail.textContent).toBe('Details for Updated')
		expect(readTableFixtureKeys(body)).toHaveLength(3)
	} finally {
		root.remove()
	}
})
