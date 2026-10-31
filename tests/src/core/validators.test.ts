import type { GridSchema } from '@src/core'
import {
	COLUMN_CELLS,
	COLUMN_LIMIT,
	auditGrid,
	isColumnCell,
	isColumnChoice,
	isGridCell,
	isGridColumn,
	isGridRow,
	isGridSchema,
	isStructuralGridSchema,
	parseRows,
	parseGrid,
} from '@src/core'
import {
	createChoiceBudgetSchema,
	createColumnBudgetSchema,
	createDeepMetadata,
	createGridRows,
	createGridSchema,
} from '../../setup.js'
import { createHostileValues } from '@orkestrel/test'
import { CHOICE_LIMIT, attempt } from '@orkestrel/contract'
import { describe, expect, it } from 'vitest'

describe('grid structural guards', () => {
	it('narrows every valid public structural value', () => {
		const schema = createGridSchema()

		expect(isGridCell('Ada')).toBe(true)
		expect(isGridCell(36)).toBe(true)
		expect(isGridCell(false)).toBe(true)
		expect(isGridCell(Number.NaN)).toBe(false)
		expect(isColumnCell('choice')).toBe(true)
		expect(isColumnCell('date')).toBe(false)
		expect(isColumnChoice({ value: 'live', label: 'Live', help: 'Published' })).toBe(true)
		expect(schema.columns.every((column) => isGridColumn(column))).toBe(true)
		expect(createGridRows().every((row) => isGridRow(row))).toBe(true)
		expect(isGridSchema(schema)).toBe(true)
	})

	it('admits every column cell of the frozen registry, in contract order', () => {
		expect(COLUMN_CELLS).toStrictEqual(['text', 'number', 'flag', 'choice'])
		expect(Object.isFrozen(COLUMN_CELLS)).toBe(true)
		expect(COLUMN_CELLS.every((cell) => isColumnCell(cell))).toBe(true)
	})

	it('rejects unknown members at every fixed record level', () => {
		expect(isColumnChoice({ value: 'live', label: 'Live', color: 'green' })).toBe(false)
		expect(isColumnChoice({ value: 'live', label: 'Live', help: undefined })).toBe(false)
		expect(isGridColumn({ cell: 'text', key: 'name', label: undefined })).toBe(false)
		expect(isGridColumn({ cell: 'text', key: 'name', hidden: undefined })).toBe(false)
		expect(isGridColumn({ cell: 'text', key: 'name', meta: undefined })).toBe(false)
		expect(isGridColumn({ cell: 'text', key: 'name', choices: [] })).toBe(false)
		expect(isGridColumn({ cell: 'choice', key: 'status' })).toBe(false)
		expect(
			isGridColumn({
				cell: 'choice',
				key: 'status',
				choices: [{ value: 'live', label: 'Live', meta: {} }],
			}),
		).toBe(false)
		expect(isGridSchema({ key: 'id', columns: [], extra: true })).toBe(false)
	})

	it('accepts null-prototype records and rejects symbol keys', () => {
		const row = Object.create(null)
		Object.defineProperty(row, 'id', { value: '1', enumerable: true })
		const symbolRow = { id: '1' }
		Object.defineProperty(symbolRow, Symbol('hidden'), { value: true, enumerable: true })

		expect(isGridRow(row)).toBe(true)
		expect(isGridRow(symbolRow)).toBe(false)
	})

	it('accepts only semantically sound schemas that their parser accepts', () => {
		const inexact = Object.assign([1, 2], { extra: 'x' })
		const unownable = {
			key: 'id',
			columns: [{ cell: 'text', key: 'id', meta: { list: inexact } }],
		}

		expect(isGridColumn({ cell: 'choice', key: 'status', choices: [] })).toBe(true)
		expect(isGridColumn(unownable.columns[0])).toBe(false)
		expect(isStructuralGridSchema({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] })).toBe(
			true,
		)
		expect(isGridSchema({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] })).toBe(false)
		expect(
			isGridSchema({
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'text', key: 'id' },
				],
			}),
		).toBe(false)
		expect(
			isGridSchema({
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'choice', key: 'status', choices: [] },
				],
			}),
		).toBe(false)
		expect(isGridSchema(unownable)).toBe(false)
		expect(isGridSchema({ columns: [{ cell: 'text', key: 'id' }] })).toBe(false)
	})

	it('keeps schema guard, parser, and audit evaluation in exact agreement', () => {
		const inexact = Object.assign([1, 2], { extra: 'x' })
		const schemas: readonly GridSchema[] = [
			createGridSchema(),
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
			const valid = auditGrid(schema).length === 0
			expect(isGridSchema(schema)).toBe(valid)
			expect(parseGrid(schema) !== undefined).toBe(valid)
		}
	})

	it('refuses every hostile corpus member through each strict guard without throwing', () => {
		const strictGuards = [isGridCell, isColumnCell, isColumnChoice, isGridColumn, isGridSchema]

		for (const [index, value] of createHostileValues().entries()) {
			for (const guard of strictGuards) {
				const accepted = attempt(() => guard(value))
				expect(accepted.success, `${guard.name} against hostile value ${index}`).toBe(true)
				expect(
					accepted.success ? accepted.value : undefined,
					`${guard.name} against hostile value ${index}`,
				).toBe(false)
			}
		}
	})

	it('answers every hostile corpus member by the row guard contract without throwing', () => {
		// The get-throwing proxy over an empty target and the null-prototype empty record are
		// accepted because isGridRow checks own string keys only, and both expose zero own keys.
		// Every other member is refused. Name the accepted positions rather than tabulating an
		// answer per position, so a corpus that grows by a refused member leaves this proof intact
		// and a corpus that grows by an accepted one breaks it.
		const accepting = new Set([2, 5])

		for (const [index, value] of createHostileValues().entries()) {
			const rowAccepted = attempt(() => isGridRow(value))
			expect(rowAccepted.success, `row guard against hostile value ${index}`).toBe(true)
			expect(
				rowAccepted.success ? rowAccepted.value : undefined,
				`row guard against hostile value ${index}`,
			).toBe(accepting.has(index))
		}
	})

	it('refuses cyclic and excessively deep metadata without throwing', () => {
		const cycle: Record<string, unknown> = {}
		cycle.self = cycle
		const deep = createDeepMetadata(600)

		for (const meta of [cycle, deep]) {
			const column = { cell: 'text', key: 'id', meta }
			expect(() => isGridColumn(column)).not.toThrow()
			expect(isGridColumn(column)).toBe(false)
			expect(() => isGridSchema({ key: 'id', columns: [column] })).not.toThrow()
			expect(isGridSchema({ key: 'id', columns: [column] })).toBe(false)
		}
	})

	it('keeps parser outputs inside their guards and accepts sound guarded inputs', () => {
		const schema = createGridSchema()
		const parsedSchema = parseGrid(schema)
		const parsedRows = parseRows(schema, createGridRows())

		expect(isGridSchema(parsedSchema)).toBe(true)
		expect(parsedRows?.every((row) => isGridRow(row))).toBe(true)
		expect(parsedSchema).toBeDefined()
		expect(parsedRows).toBeDefined()
	})
})
