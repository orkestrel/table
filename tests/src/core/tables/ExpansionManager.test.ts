import type { TableEventMap } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { createTableFixture } from '../../../setup.js'

describe('ExpansionManager', () => {
	it('expands zero, one, or many rows and all rows with no argument', () => {
		const table = createTableFixture()

		expect(table.expansion.expand([])).toBe(true)
		expect(table.expansion.expand('1')).toBe(true)
		expect(table.expansion.expand(['2', '3'])).toBe(true)
		table.expansion.expand()

		expect([...table.expansion.keys]).toStrictEqual(['1', '2', '3', '4'])
	})

	it('validates expansion, clear, and toggle batches before changing keys', () => {
		const table = createTableFixture()
		table.expansion.expand('1')

		expect(table.expansion.expand(['2', 'missing'])).toBe(false)
		expect(table.expansion.clear(['1', 'missing'])).toBe(false)
		expect(table.expansion.toggle(['1', 'missing'])).toBe(false)
		expect([...table.expansion.keys]).toStrictEqual(['1'])
	})

	it('clears and toggles zero, one, or many rows', () => {
		const table = createTableFixture()
		const expansions = createRecorder<TableEventMap['expand']>()
		table.emitter.on('expand', expansions.handler)
		table.expansion.expand(['1', '2', '3'])

		expect(table.expansion.toggle(['1', '1'])).toBe(true)
		expect(table.expansion.clear([])).toBe(true)
		expect(table.expansion.clear('4')).toBe(true)
		expect(table.expansion.clear(['1', '2'])).toBe(true)
		expect(table.expansion.toggle(['3', '4'])).toBe(true)
		table.expansion.clear()

		expect(table.expansion.keys.size).toBe(0)
		expect(expansions.count).toBe(4)
	})

	it('returns owned sets, emits only changes, and prunes removed rows', () => {
		const table = createTableFixture()
		const expansions = createRecorder<TableEventMap['expand']>()
		table.emitter.on('expand', expansions.handler)

		table.expansion.expand(['1', '2'])
		const held = table.expansion.keys
		table.expansion.expand(['1', '2'])
		table.rows.remove('1')

		expect([...held]).toStrictEqual(['1', '2'])
		expect([...table.expansion.keys]).toStrictEqual(['2'])
		expect(expansions.calls.map((call) => [...call[0]])).toStrictEqual([['1', '2'], ['2']])
	})
})
