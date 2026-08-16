import type { JSONPrimitive, JSONRecord, JSONValue } from '@orkestrel/contract'
import type {
	CellComparator,
	CellMatcher,
	TableCell,
	TableColumn,
	TableFilter,
	TableKey,
	TableOrder,
	TableRow,
	TableSchema,
} from './types.js'
import {
	attempt,
	cloneJSONRecord,
	isArray,
	isBoolean,
	isContractError,
	isFiniteNumber,
	isRecord,
	isString,
	readArrayEntries,
} from '@orkestrel/contract'
import {
	CHOICE_LIMIT,
	COLUMN_LIMIT,
	NAME_LIMIT,
	NODE_LIMIT,
	STRING_LIMIT,
	TEXT_LIMIT,
} from './constants.js'
import { TableError } from './errors.js'

/**
 * Find one column by key.
 *
 * @param schema - The schema whose columns to search.
 * @param key - The column key to find.
 * @returns The declared column, or `undefined` when no column has that key.
 */
export function extractColumn(schema: TableSchema, key: string): TableColumn | undefined {
	return schema.columns.find((column) => column.key === key)
}

/**
 * Read one row's declared identity.
 *
 * @param schema - The schema that names the identity column.
 * @param row - The row whose identity to read.
 * @returns The non-empty string identity, or `undefined` when it is unusable.
 */
export function extractKey(schema: TableSchema, row: TableRow): TableKey | undefined {
	if (!Object.hasOwn(row, schema.key)) return undefined
	const key = row[schema.key]
	return isString(key) && key.length > 0 ? key : undefined
}

/**
 * Check whether a value has the shape required by one column cell.
 *
 * @param column - The column that owns the cell.
 * @param value - The unknown value to inspect.
 * @returns Whether the column can hold the value.
 */
export function matchesCell(column: TableColumn, value: unknown): value is TableCell {
	if (isString(value) && value.length > STRING_LIMIT) return false

	switch (column.cell) {
		case 'text':
			return isString(value)
		case 'number':
			return isFiniteNumber(value)
		case 'flag':
			return isBoolean(value)
		case 'choice':
			return isString(value) && column.choices.some((choice) => choice.value === value)
	}
}

/**
 * Compare two cells in ascending order according to one column.
 *
 * @param column - The column that fixes the comparison.
 * @param left - The first cell, or absence.
 * @param right - The second cell, or absence.
 * @returns A negative number, positive number, or zero in sort-comparator form.
 */
export function compareCells(
	column: TableColumn,
	left: TableCell | undefined,
	right: TableCell | undefined,
): number {
	if (left === undefined) return right === undefined ? 0 : -1
	if (right === undefined) return 1

	switch (column.cell) {
		case 'text':
			if (!isString(left) || !isString(right)) return 0
			return left < right ? -1 : left > right ? 1 : 0
		case 'number':
			if (!isFiniteNumber(left) || !isFiniteNumber(right)) return 0
			return left - right
		case 'flag':
			if (!isBoolean(left) || !isBoolean(right)) return 0
			return left === right ? 0 : left ? 1 : -1
		case 'choice': {
			if (!isString(left) || !isString(right)) return 0
			const leftIndex = column.choices.findIndex((choice) => choice.value === left)
			const rightIndex = column.choices.findIndex((choice) => choice.value === right)
			return leftIndex - rightIndex
		}
	}
}

/**
 * Test one cell against a filter according to its column.
 *
 * @param column - The column that fixes the accepted operators.
 * @param cell - The cell to test, or absence.
 * @param filter - The filter to apply.
 * @returns Whether the filter accepts the cell.
 */
export function matchesFilter(
	column: TableColumn,
	cell: TableCell | undefined,
	filter: TableFilter,
): boolean {
	if (cell === undefined || filter.column !== column.key || !matchesCell(column, cell)) return false

	switch (filter.operator) {
		case 'contains':
			return (
				(column.cell === 'text' || column.cell === 'choice') &&
				isString(cell) &&
				filter.text.length <= STRING_LIMIT &&
				cell.includes(filter.text)
			)
		case 'between':
			return (
				(column.cell === 'text' || column.cell === 'number') &&
				matchesCell(column, filter.minimum) &&
				matchesCell(column, filter.maximum) &&
				compareCells(column, cell, filter.minimum) >= 0 &&
				compareCells(column, cell, filter.maximum) <= 0
			)
		case 'equals':
			return matchesCell(column, filter.value) && cell === filter.value
	}
}

/**
 * Keep the rows accepted by every filter.
 *
 * @param schema - The schema that declares the filtered columns.
 * @param rows - The rows to filter.
 * @param filters - The filters to apply with and-only composition.
 * @param matchers - Optional per-column replacements for the default matcher.
 * @returns A frozen copy of the accepted rows in their original order.
 */
export function filterRows(
	schema: TableSchema,
	rows: readonly TableRow[],
	filters: readonly TableFilter[],
	matchers?: Readonly<Record<string, CellMatcher>>,
): readonly TableRow[] {
	return Object.freeze(
		rows.filter((row) =>
			filters.every((filter) => {
				const column = extractColumn(schema, filter.column)
				if (column === undefined) return false
				const matcher =
					matchers !== undefined && Object.hasOwn(matchers, column.key)
						? matchers[column.key]
						: undefined
				const cell = Object.hasOwn(row, column.key) ? row[column.key] : undefined
				return matcher === undefined ? matchesFilter(column, cell, filter) : matcher(cell, filter)
			}),
		),
	)
}

/**
 * Order rows stably by a sequence of terms.
 *
 * @param schema - The schema that declares the sorted columns.
 * @param rows - The rows to order.
 * @param orders - The ordered sort terms.
 * @param comparators - Optional per-column replacements for the default comparator.
 * @returns A frozen sorted copy that leaves the input untouched.
 */
export function sortRows(
	schema: TableSchema,
	rows: readonly TableRow[],
	orders: readonly TableOrder[],
	comparators?: Readonly<Record<string, CellComparator>>,
): readonly TableRow[] {
	const indexed = rows.map((row, index) => ({ row, index }))

	indexed.sort((left, right) => {
		for (const order of orders) {
			const column = extractColumn(schema, order.column)
			if (column === undefined) continue
			const comparator =
				comparators !== undefined && Object.hasOwn(comparators, column.key)
					? comparators[column.key]
					: undefined
			const leftCell = Object.hasOwn(left.row, column.key) ? left.row[column.key] : undefined
			const rightCell = Object.hasOwn(right.row, column.key) ? right.row[column.key] : undefined
			const compared =
				comparator === undefined
					? compareCells(column, leftCell, rightCell)
					: comparator(leftCell, rightCell)
			if (compared !== 0 && !Number.isNaN(compared)) {
				return order.direction === 'ascending' ? compared : -compared
			}
		}

		return left.index - right.index
	})

	return Object.freeze(indexed.map((entry) => entry.row))
}

/**
 * Audit a structurally valid schema for domain and budget faults.
 *
 * @param schema - The table schema to audit.
 * @returns Frozen human-readable diagnostics, or an empty list when the schema is sound.
 */
export function auditTable(schema: TableSchema): readonly string[] {
	const faults: string[] = []
	const columns = new Set<string>()
	let choiceExceeded: string | undefined
	let nameExceeded = schema.name !== undefined && schema.name.length > NAME_LIMIT

	if (schema.columns.length > COLUMN_LIMIT) {
		faults.push(`schema declares more than ${COLUMN_LIMIT} columns`)
	}

	const columnCount = Math.min(schema.columns.length, COLUMN_LIMIT + 1)
	for (let index = 0; index < columnCount; index += 1) {
		const column = schema.columns[index]
		if (column === undefined) continue
		if (column.key.length > NAME_LIMIT) nameExceeded = true
		if (
			choiceExceeded === undefined &&
			column.cell === 'choice' &&
			column.choices.length > CHOICE_LIMIT
		) {
			choiceExceeded = column.key
		}
	}

	if (choiceExceeded !== undefined) {
		faults.push(`column "${choiceExceeded}" offers more than ${CHOICE_LIMIT} choices`)
	}
	if (nameExceeded) faults.push(`schema contains a name longer than ${NAME_LIMIT}`)

	const pending: unknown[] = [schema]
	const metadata: boolean[] = [false]
	let position = 0
	let stringExceeded = false
	let textExceeded = false
	let nodeExceeded = false
	let text = 0

	while (position < pending.length) {
		const node = pending[position]
		const inMeta = metadata[position] === true
		position += 1

		if (isString(node)) {
			if (node.length > STRING_LIMIT) stringExceeded = true
			text = Math.min(TEXT_LIMIT + 1, text + node.length)
			if (text > TEXT_LIMIT) textExceeded = true
			continue
		}

		if (isArray(node)) {
			const read = readArrayEntries(node)
			if (!read.success || !read.value.dense) continue
			for (const entry of read.value.entries) {
				if (pending.length >= NODE_LIMIT) {
					nodeExceeded = true
					continue
				}
				pending.push(entry)
				metadata.push(inMeta)
			}
			continue
		}

		if (!isRecord(node)) continue
		const keys = attempt(() => Object.keys(node))
		if (!keys.success) continue

		for (const key of keys.value) {
			if (inMeta) {
				if (key.length > STRING_LIMIT) stringExceeded = true
				text = Math.min(TEXT_LIMIT + 1, text + key.length)
				if (text > TEXT_LIMIT) textExceeded = true
			}

			const value = attempt(() => node[key])
			if (!value.success || value.value === undefined) continue
			if (pending.length >= NODE_LIMIT) {
				nodeExceeded = true
				continue
			}
			pending.push(value.value)
			metadata.push(inMeta || key === 'meta')
		}
	}

	if (stringExceeded) faults.push(`schema contains a string longer than ${STRING_LIMIT}`)
	if (textExceeded) faults.push(`schema retains more than ${TEXT_LIMIT} string code units`)
	if (nodeExceeded) faults.push(`schema retains more than ${NODE_LIMIT} nodes`)

	for (let index = 0; index < columnCount; index += 1) {
		const column = schema.columns[index]
		if (column === undefined) continue
		if (column.key.length === 0) faults.push('column "" has an empty key')
		if (columns.has(column.key)) {
			faults.push(`column "${column.key}" is declared more than once`)
		}
		columns.add(column.key)

		if (column.cell === 'choice') {
			const choices = new Set<string>()
			const choiceCount = Math.min(column.choices.length, CHOICE_LIMIT + 1)
			for (let choiceIndex = 0; choiceIndex < choiceCount; choiceIndex += 1) {
				const choice = column.choices[choiceIndex]
				if (choice === undefined) continue
				if (choices.has(choice.value)) {
					faults.push(`column "${column.key}" offers choice "${choice.value}" more than once`)
				}
				choices.add(choice.value)
			}
			if (column.choices.length === 0) {
				faults.push(`column "${column.key}" offers no choices`)
			}
		}
	}

	const key = extractColumn(schema, schema.key)
	if (key === undefined) {
		faults.push(`schema key "${schema.key}" names no declared column`)
	} else if (key.cell === 'number' || key.cell === 'flag') {
		faults.push(`schema key "${schema.key}" names a ${key.cell} column, which holds no identity`)
	}

	return Object.freeze(faults)
}

/**
 * Project a schema into declaration-ordered JSON.
 *
 * @param schema - The schema to project.
 * @returns A deeply owned JSON record with absent members omitted.
 * @throws A {@link TableError} coded `SCHEMA` when metadata cannot be owned.
 */
export function serializeTable(schema: TableSchema): JSONRecord {
	const output: Record<string, JSONValue> = {}
	if (schema.name !== undefined) output.name = schema.name
	if (schema.label !== undefined) output.label = schema.label
	if (schema.help !== undefined) output.help = schema.help
	output.key = schema.key
	output.columns = schema.columns.map((column): JSONRecord => {
		const entry: Record<string, JSONValue> = { cell: column.cell, key: column.key }
		if (column.label !== undefined) entry.label = column.label
		if (column.help !== undefined) entry.help = column.help
		if (column.hidden !== undefined) entry.hidden = column.hidden
		if (column.meta !== undefined) entry.meta = column.meta
		if (column.cell === 'choice') {
			entry.choices = column.choices.map((choice): JSONRecord => {
				const option: Record<string, JSONValue> = {
					value: choice.value,
					label: choice.label,
				}
				if (choice.help !== undefined) option.help = choice.help
				return option
			})
		}
		return entry
	})

	try {
		return cloneJSONRecord(output)
	} catch (error) {
		if (!isContractError(error)) throw error
		throw new TableError('SCHEMA', 'schema contains metadata that cannot be owned')
	}
}

/**
 * Project rows into schema-column-ordered JSON.
 *
 * @param schema - The schema that fixes cell order.
 * @param rows - The rows to project.
 * @returns A frozen list of owned JSON records with absent cells omitted.
 */
export function serializeRows(
	schema: TableSchema,
	rows: readonly TableRow[],
): readonly JSONRecord[] {
	const output: JSONRecord[] = []

	for (const row of rows) {
		const entry: Record<string, JSONPrimitive> = {}
		for (const column of schema.columns) {
			if (!Object.hasOwn(row, column.key)) continue
			const value = row[column.key]
			if (value === undefined) continue
			Object.defineProperty(entry, column.key, {
				value,
				enumerable: true,
				configurable: true,
				writable: true,
			})
		}
		output.push(cloneJSONRecord(entry))
	}

	return Object.freeze(output)
}
