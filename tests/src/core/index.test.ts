import type {
	ChoiceColumn,
	GridColumn,
	GridFilter,
	GridKey,
	GridOrder,
	GridRow,
	GridSchema,
} from '@src/core'
import * as entry from '@src/core'
import { describe, expect, it } from 'vitest'

const status: ChoiceColumn = {
	cell: 'choice',
	key: 'status',
	label: 'Status',
	choices: [
		{ value: 'draft', label: 'Draft' },
		{ value: 'live', label: 'Live' },
		{ value: 'archived', label: 'Archived', help: 'Kept, and out of the way' },
	],
}

const schema: GridSchema = {
	label: 'People',
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id', label: 'Reference' },
		{ cell: 'text', key: 'name', label: 'Name' },
		{ cell: 'number', key: 'age', label: 'Age', meta: { align: 'end' } },
		{ cell: 'flag', key: 'active', label: 'Active', hidden: true },
		status,
	],
}

const rows: readonly GridRow[] = [
	{ id: '7', name: 'Ada', age: 36, active: true, status: 'live' },
	{ id: '8', name: 'Grace', status: 'draft' },
]

describe('src core entry', () => {
	it('exports every pure engine runtime name exactly', () => {
		expect(Object.keys(entry).sort()).toStrictEqual(
			[
				'CHOICE_LIMIT',
				'COLUMN_CELLS',
				'COLUMN_LIMIT',
				'NAME_LIMIT',
				'NODE_LIMIT',
				'STRING_LIMIT',
				'TEXT_LIMIT',
				'Grid',
				'GridError',
				'admitsFilter',
				'auditGrid',
				'cloneRow',
				'cloneGridSchema',
				'compareCells',
				'computeKeys',
				'createGrid',
				'extractColumn',
				'extractGridKey',
				'filterGridRows',
				'isColumnCell',
				'isColumnChoice',
				'isGridCell',
				'isGridColumn',
				'isGridError',
				'isGridRow',
				'isStructuralGridSchema',
				'isGridSchema',
				'matchesCell',
				'matchesFilter',
				'matchesTerms',
				'matchesGridRow',
				'mergeTerms',
				'parseRows',
				'parseGrid',
				'removeTerms',
				'serializeRows',
				'serializeGrid',
				'sortGridRows',
			].sort(),
		)
	})

	it('declares row identity as a column the schema carries', () => {
		const key: GridKey = '7'
		expect(schema.columns.some((column) => column.key === schema.key)).toBe(true)
		expect(rows.some((row) => row[schema.key] === key)).toBe(true)
		expect(rows.at(1)?.age).toBeUndefined()
	})

	it('narrows a column on its cell', () => {
		const column: GridColumn = status
		expect(
			column.cell === 'choice' ? column.choices.map((choice) => choice.value) : [],
		).toStrictEqual(['draft', 'live', 'archived'])
	})

	it('names a sort direction the fleet way', () => {
		const orders: readonly GridOrder[] = [
			{ column: 'status', direction: 'ascending' },
			{ column: 'age', direction: 'descending' },
		]
		expect(orders.map((order) => order.direction)).toStrictEqual(['ascending', 'descending'])
	})

	it('carries one operand set per filter operator', () => {
		const filters: readonly GridFilter[] = [
			{ column: 'name', operator: 'contains', text: 'ad' },
			{ column: 'age', operator: 'between', minimum: 30, maximum: 40 },
			{ column: 'active', operator: 'equals', value: true },
		]
		const between = filters.find((filter) => filter.operator === 'between')
		expect(between?.operator === 'between' ? between.maximum : undefined).toBe(40)
		expect(filters.map((filter) => filter.column)).toStrictEqual(['name', 'age', 'active'])
	})
})
