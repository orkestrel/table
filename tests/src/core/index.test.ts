import type {
	ChoiceColumn,
	TableColumn,
	TableFilter,
	TableKey,
	TableOrder,
	TableRow,
	TableSchema,
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

const schema: TableSchema = {
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

const rows: readonly TableRow[] = [
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
				'TableError',
				'auditTable',
				'cloneRow',
				'cloneSchema',
				'compareCells',
				'extractColumn',
				'extractKey',
				'filterRows',
				'isColumnCell',
				'isColumnChoice',
				'isTableCell',
				'isTableColumn',
				'isTableError',
				'isTableRow',
				'isTableSchema',
				'matchesCell',
				'matchesFilter',
				'parseRows',
				'parseTable',
				'serializeRows',
				'serializeTable',
				'sortRows',
			].sort(),
		)
	})

	it('declares row identity as a column the schema carries', () => {
		const key: TableKey = '7'
		expect(schema.columns.some((column) => column.key === schema.key)).toBe(true)
		expect(rows.some((row) => row[schema.key] === key)).toBe(true)
		expect(rows.at(1)?.age).toBeUndefined()
	})

	it('narrows a column on its cell', () => {
		const column: TableColumn = status
		expect(
			column.cell === 'choice' ? column.choices.map((choice) => choice.value) : [],
		).toStrictEqual(['draft', 'live', 'archived'])
	})

	it('names a sort direction the fleet way', () => {
		const orders: readonly TableOrder[] = [
			{ column: 'status', direction: 'ascending' },
			{ column: 'age', direction: 'descending' },
		]
		expect(orders.map((order) => order.direction)).toStrictEqual(['ascending', 'descending'])
	})

	it('carries one operand set per filter operator', () => {
		const filters: readonly TableFilter[] = [
			{ column: 'name', operator: 'contains', text: 'ad' },
			{ column: 'age', operator: 'between', minimum: 30, maximum: 40 },
			{ column: 'active', operator: 'equals', value: true },
		]
		const between = filters.find((filter) => filter.operator === 'between')
		expect(between?.operator === 'between' ? between.maximum : undefined).toBe(40)
		expect(filters.map((filter) => filter.column)).toStrictEqual(['name', 'age', 'active'])
	})
})
