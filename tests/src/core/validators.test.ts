import type { TableSchema } from '@src/core'
import {
	CHOICE_LIMIT,
	COLUMN_LIMIT,
	auditTable,
	isColumnCell,
	isColumnChoice,
	isTableCell,
	isTableColumn,
	isTableRow,
	isTableSchema,
	isStructuralTableSchema,
	parseRows,
	parseTable,
} from '@src/core'
import {
	createChoiceBudgetSchema,
	createColumnBudgetSchema,
	createTableRows,
	createTableSchema,
} from '../../setup.js'
import { createHostileValues } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'

describe('table structural guards', () => {
	it('narrows every valid public structural value', () => {
		const schema = createTableSchema()

		expect(isTableCell('Ada')).toBe(true)
		expect(isTableCell(36)).toBe(true)
		expect(isTableCell(false)).toBe(true)
		expect(isTableCell(Number.NaN)).toBe(false)
		expect(isColumnCell('choice')).toBe(true)
		expect(isColumnCell('date')).toBe(false)
		expect(isColumnChoice({ value: 'live', label: 'Live', help: 'Published' })).toBe(true)
		expect(schema.columns.every((column) => isTableColumn(column))).toBe(true)
		expect(createTableRows().every((row) => isTableRow(row))).toBe(true)
		expect(isTableSchema(schema)).toBe(true)
	})

	it('rejects unknown members at every fixed record level', () => {
		expect(isColumnChoice({ value: 'live', label: 'Live', color: 'green' })).toBe(false)
		expect(isColumnChoice({ value: 'live', label: 'Live', help: undefined })).toBe(false)
		expect(isTableColumn({ cell: 'text', key: 'name', label: undefined })).toBe(false)
		expect(isTableColumn({ cell: 'text', key: 'name', hidden: undefined })).toBe(false)
		expect(isTableColumn({ cell: 'text', key: 'name', meta: undefined })).toBe(false)
		expect(isTableColumn({ cell: 'text', key: 'name', choices: [] })).toBe(false)
		expect(isTableColumn({ cell: 'choice', key: 'status' })).toBe(false)
		expect(
			isTableColumn({
				cell: 'choice',
				key: 'status',
				choices: [{ value: 'live', label: 'Live', meta: {} }],
			}),
		).toBe(false)
		expect(isTableSchema({ key: 'id', columns: [], extra: true })).toBe(false)
	})

	it('accepts null-prototype records and rejects symbol keys', () => {
		const row = Object.create(null)
		Object.defineProperty(row, 'id', { value: '1', enumerable: true })
		const symbolRow = { id: '1' }
		Object.defineProperty(symbolRow, Symbol('hidden'), { value: true, enumerable: true })

		expect(isTableRow(row)).toBe(true)
		expect(isTableRow(symbolRow)).toBe(false)
	})

	it('accepts only semantically sound schemas that their parser accepts', () => {
		const inexact = Object.assign([1, 2], { extra: 'x' })
		const unownable = {
			key: 'id',
			columns: [{ cell: 'text', key: 'id', meta: { list: inexact } }],
		}

		expect(isTableColumn({ cell: 'choice', key: 'status', choices: [] })).toBe(true)
		expect(isTableColumn(unownable.columns[0])).toBe(false)
		expect(
			isStructuralTableSchema({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] }),
		).toBe(true)
		expect(isTableSchema({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] })).toBe(false)
		expect(
			isTableSchema({
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'text', key: 'id' },
				],
			}),
		).toBe(false)
		expect(
			isTableSchema({
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'choice', key: 'status', choices: [] },
				],
			}),
		).toBe(false)
		expect(isTableSchema(unownable)).toBe(false)
		expect(isTableSchema({ columns: [{ cell: 'text', key: 'id' }] })).toBe(false)
	})

	it('keeps schema guard, parser, and audit evaluation in exact agreement', () => {
		const inexact = Object.assign([1, 2], { extra: 'x' })
		const schemas: readonly TableSchema[] = [
			createTableSchema(),
			{ key: 'missing', columns: [{ cell: 'text', key: 'id' }] },
			{
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{
						cell: 'choice',
						key: 'status',
						choices: [
							{ value: 'live', label: 'Live' },
							{ value: 'live', label: 'Published' },
						],
					},
				],
			},
			createColumnBudgetSchema(COLUMN_LIMIT + 1),
			createChoiceBudgetSchema(CHOICE_LIMIT + 1),
			{
				key: 'id',
				columns: [{ cell: 'text', key: 'id', meta: { list: inexact } }],
			},
		]

		for (const schema of schemas) {
			const valid = auditTable(schema).length === 0
			expect(isTableSchema(schema)).toBe(valid)
			expect(parseTable(schema) !== undefined).toBe(valid)
		}
	})

	it('refuses every hostile corpus member through each strict guard without throwing', () => {
		const strictGuards = [isTableCell, isColumnCell, isColumnChoice, isTableColumn, isTableSchema]

		for (const [index, value] of createHostileValues().entries()) {
			for (const guard of strictGuards) {
				let accepted: boolean | undefined
				expect(() => {
					accepted = guard(value)
				}, `${guard.name} against hostile value ${index}`).not.toThrow()
				expect(accepted, `${guard.name} against hostile value ${index}`).toBe(false)
			}
		}
	})

	it('answers every hostile corpus member by the row guard contract without throwing', () => {
		// The get-throwing proxy over an empty target and the null-prototype empty record are
		// accepted because isTableRow checks own string keys only, and both expose zero own keys.
		// Every other member is refused. Name the accepted positions rather than tabulating an
		// answer per position, so a corpus that grows by a refused member leaves this proof intact
		// and a corpus that grows by an accepted one breaks it.
		const accepting = new Set([2, 5])

		for (const [index, value] of createHostileValues().entries()) {
			let rowAccepted: boolean | undefined
			expect(() => {
				rowAccepted = isTableRow(value)
			}, `row guard against hostile value ${index}`).not.toThrow()
			expect(rowAccepted, `row guard against hostile value ${index}`).toBe(accepting.has(index))
		}
	})

	it('refuses cyclic and excessively deep metadata without throwing', () => {
		const cycle: Record<string, unknown> = {}
		cycle.self = cycle
		const deep: Record<string, unknown> = {}
		let current = deep
		for (let index = 0; index < 600; index += 1) {
			const next: Record<string, unknown> = {}
			current.next = next
			current = next
		}

		for (const meta of [cycle, deep]) {
			const column = { cell: 'text', key: 'id', meta }
			expect(() => isTableColumn(column)).not.toThrow()
			expect(isTableColumn(column)).toBe(false)
			expect(() => isTableSchema({ key: 'id', columns: [column] })).not.toThrow()
			expect(isTableSchema({ key: 'id', columns: [column] })).toBe(false)
		}
	})

	it('keeps parser outputs inside their guards and accepts sound guarded inputs', () => {
		const schema = createTableSchema()
		const parsedSchema = parseTable(schema)
		const parsedRows = parseRows(schema, createTableRows())

		expect(isTableSchema(parsedSchema)).toBe(true)
		expect(parsedRows?.every((row) => isTableRow(row))).toBe(true)
		expect(parsedSchema).toBeDefined()
		expect(parsedRows).toBeDefined()
	})
})
