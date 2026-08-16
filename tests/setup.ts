import type { JSONValue } from '@orkestrel/contract'
import type { TableColumn, TableRow, TableSchema } from '@src/core'
import { STRING_LIMIT, TEXT_LIMIT } from '@src/core'

/** Build a fresh schema spanning every column cell. */
export function createTableSchema(): TableSchema {
	return {
		name: 'people',
		label: 'People',
		help: 'A complete table schema',
		key: 'id',
		columns: [
			{ cell: 'text', key: 'id', label: 'Reference' },
			{ cell: 'text', key: 'name', label: 'Name' },
			{ cell: 'number', key: 'age', label: 'Age', meta: { align: 'end' } },
			{ cell: 'flag', key: 'active', label: 'Active' },
			{
				cell: 'choice',
				key: 'status',
				label: 'Status',
				choices: [
					{ value: 'draft', label: 'Draft' },
					{ value: 'live', label: 'Live' },
					{ value: 'archived', label: 'Archived', help: 'Kept for history' },
				],
			},
		],
	}
}

/** Build fresh rows spanning present and absent cells. */
export function createTableRows(): readonly TableRow[] {
	return [
		{ id: '1', name: 'Ada', age: 36, active: true, status: 'live' },
		{ id: '2', name: 'Grace', age: 45, active: false, status: 'draft' },
		{ id: '3', name: 'Alan', age: 41, active: true, status: 'live' },
		{ id: '4', name: 'Lin', active: false, status: 'archived' },
	]
}

/** Build a schema with an exact column population. */
export function createColumnBudgetSchema(count: number): TableSchema {
	const columns: TableColumn[] = []
	for (let index = 0; index < count; index += 1) {
		columns.push({ cell: 'text', key: index === 0 ? 'id' : `column-${index}` })
	}
	return { key: 'id', columns }
}

/** Build a schema with an exact choice population. */
export function createChoiceBudgetSchema(count: number): TableSchema {
	return {
		key: 'id',
		columns: [
			{ cell: 'text', key: 'id' },
			{
				cell: 'choice',
				key: 'status',
				choices: Array.from({ length: count }, (_, index) => ({
					value: String(index),
					label: String(index),
				})),
			},
		],
	}
}

/** Build a schema at the whole-text budget plus an optional delta. */
export function createTextBudgetSchema(extra = 0): TableSchema {
	const meta: Record<string, JSONValue> = {}
	let remaining = TEXT_LIMIT - 46 + extra
	for (let index = 0; index < 16; index += 1) {
		const length = Math.min(STRING_LIMIT, remaining)
		meta[`k${index}`] = 'x'.repeat(length)
		remaining -= length
	}
	return { key: 'id', columns: [{ cell: 'text', key: 'id', meta }] }
}

/** Build a schema at the whole-node budget plus an optional delta. */
export function createNodeBudgetSchema(extra = 0): TableSchema {
	return {
		key: 'id',
		columns: [
			{
				cell: 'text',
				key: 'id',
				meta: { nodes: Array.from({ length: 16376 + extra }, () => null) },
			},
		],
	}
}
