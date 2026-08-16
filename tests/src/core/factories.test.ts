import { createTable, Table } from '@src/core'
import { describe, expect, it } from 'vitest'
import { createTableRows, createTableSchema, readTableError } from '../../setup.js'

describe('createTable', () => {
	it('returns a working Table through the interface construction path', () => {
		const table = createTable(createTableSchema(), { rows: createTableRows(), limit: 2 })

		expect(table).toBeInstanceOf(Table)
		expect(table.count).toBe(4)
		expect(table.view.map((row) => row.id)).toStrictEqual(['1', '2'])
	})

	it('takes the same schema refusal path as the class', () => {
		expect(
			readTableError(() => createTable({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] })),
		).toBe('SCHEMA')
	})

	it('seeds quietly and forwards emitter options', () => {
		const events: string[] = []
		const table = createTable(createTableSchema(), {
			rows: createTableRows(),
			on: { write: (key) => events.push(key) },
		})

		expect(events).toStrictEqual([])
		table.rows.add({ id: '5', name: 'Katherine', age: 37, active: true, status: 'draft' })
		expect(events).toStrictEqual(['5'])
	})
})
