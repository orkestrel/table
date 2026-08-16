import type { TableSchema } from '@src/core'
import { attempt } from '@orkestrel/contract'
import { cloneRow, cloneSchema, isTableError } from '@src/core'
import { createTableSchema } from '../../setup.js'
import { describe, expect, it } from 'vitest'

describe('table cloners', () => {
	it('owns and freezes a row without changing its scalar cells', () => {
		const row = { id: '1', name: 'Ada', age: 36 }
		const clone = cloneRow(row)

		row.name = 'Changed'

		expect(clone).toStrictEqual({ id: '1', name: 'Ada', age: 36 })
		expect(clone).not.toBe(row)
		expect(Object.isFrozen(clone)).toBe(true)
	})

	it('owns and freezes every nested column, choice, list, and metadata record', () => {
		const schema = createTableSchema()
		const meta = schema.columns[2]?.meta
		const clone = cloneSchema(schema)

		expect(clone).toEqual(schema)
		expect(clone).not.toBe(schema)
		expect(clone.columns).not.toBe(schema.columns)
		expect(clone.columns[0]).not.toBe(schema.columns[0])
		expect(clone.columns[2]?.meta).not.toBe(meta)
		expect(Object.isFrozen(clone)).toBe(true)
		expect(Object.isFrozen(clone.columns)).toBe(true)
		expect(clone.columns.every((column) => Object.isFrozen(column))).toBe(true)
		expect(clone.columns[4]?.cell === 'choice' && Object.isFrozen(clone.columns[4].choices)).toBe(
			true,
		)
		expect(
			clone.columns[4]?.cell === 'choice' &&
				clone.columns[4].choices.every((entry) => Object.isFrozen(entry)),
		).toBe(true)
		expect(Object.isFrozen(clone.columns[2]?.meta)).toBe(true)
	})

	it('keeps caller mutations out of nested choice and metadata snapshots', () => {
		const meta = { renderer: { align: 'end' } }
		const choices = [{ value: 'live', label: 'Live' }]
		const schema: TableSchema = {
			key: 'id',
			columns: [
				{ cell: 'text', key: 'id', meta },
				{ cell: 'choice', key: 'status', choices },
			],
		}
		const clone = cloneSchema(schema)

		meta.renderer.align = 'start'
		choices[0] = { value: 'draft', label: 'Draft' }

		expect(clone.columns[0]?.meta).toEqual({ renderer: { align: 'end' } })
		expect(clone.columns[1]?.cell === 'choice' ? clone.columns[1].choices : []).toEqual([
			{ value: 'live', label: 'Live' },
		])
	})

	it('translates metadata ownership refusal into a schema-coded TableError', () => {
		const schema: TableSchema = {
			key: 'id',
			columns: [
				{
					cell: 'text',
					key: 'id',
					meta: {
						get icon() {
							return 'key'
						},
					},
				},
			],
		}
		const outcome = attempt(() => cloneSchema(schema))
		const error = outcome.success ? undefined : outcome.error

		expect(isTableError(error)).toBe(true)
		expect(isTableError(error) ? error.code : undefined).toBe('SCHEMA')
		expect(isTableError(error) ? error.context?.column : undefined).toBe('id')
	})
})
