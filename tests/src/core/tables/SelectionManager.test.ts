import type { TableEventMap } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { createTableFixture } from '../../../setup.js'

describe('SelectionManager', () => {
	it('selects zero, one, or many rows and all rows with no argument', () => {
		const table = createTableFixture()

		expect(table.selection.select([])).toBe(true)
		expect(table.selection.select('1')).toBe(true)
		expect(table.selection.select(['2', '3'])).toBe(true)
		table.selection.select()

		expect([...table.selection.keys]).toStrictEqual(['1', '2', '3', '4'])
	})

	it('validates a selection batch before changing any key', () => {
		const table = createTableFixture()

		expect(table.selection.select(['1', 'missing', '2'])).toBe(false)
		expect(table.selection.keys.size).toBe(0)
	})

	it('clears zero, one, or many picks and treats a known unpicked key as success', () => {
		const table = createTableFixture()
		table.selection.select(['1', '2', '3'])

		expect(table.selection.clear([])).toBe(true)
		expect(table.selection.clear('4')).toBe(true)
		expect(table.selection.clear(['1', '2'])).toBe(true)
		expect(table.selection.clear(['3', 'missing'])).toBe(false)
		table.selection.clear()

		expect(table.selection.keys.size).toBe(0)
	})

	it('toggles one or many keys atomically', () => {
		const table = createTableFixture()
		const selections = createRecorder<TableEventMap['select']>()
		table.emitter.on('select', selections.handler)
		table.selection.select('1')

		expect(table.selection.toggle(['1', '1'])).toBe(true)
		expect(table.selection.toggle(['1', '2'])).toBe(true)
		expect([...table.selection.keys]).toStrictEqual(['2'])
		expect(table.selection.toggle(['2', 'missing'])).toBe(false)
		expect([...table.selection.keys]).toStrictEqual(['2'])
		expect(selections.count).toBe(2)
	})

	it('returns owned key sets, emits only changes, and prunes removed rows', () => {
		const table = createTableFixture()
		const selections = createRecorder<TableEventMap['select']>()
		table.emitter.on('select', selections.handler)

		table.selection.select(['1', '2'])
		const held = table.selection.keys
		table.selection.select(['1', '2'])
		table.rows.remove('1')

		expect(held).not.toBe(table.selection.keys)
		expect([...held]).toStrictEqual(['1', '2'])
		expect([...table.selection.keys]).toStrictEqual(['2'])
		expect(selections.calls.map((call) => [...call[0]])).toStrictEqual([['1', '2'], ['2']])
	})
})
