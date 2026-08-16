import type {
	ColumnCell,
	ColumnChoice,
	TableCell,
	TableColumn,
	TableRow,
	TableSchema,
} from './types.js'
import {
	arrayOf,
	attempt,
	isBoolean,
	isBoundedJSONRecord,
	isFiniteNumber,
	isRecord,
	isString,
	recordOf,
	unionOf,
} from '@orkestrel/contract'
import { COLUMN_CELLS } from './constants.js'
import { auditTable } from './helpers.js'

/**
 * Determine whether an unknown value has a table cell shape.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a string, finite number, or boolean.
 */
export function isTableCell(input: unknown): input is TableCell {
	return unionOf(isString, isFiniteNumber, isBoolean)(input)
}

/**
 * Determine whether an unknown value is a record of table cells.
 *
 * @param input - The value to inspect.
 * @returns Whether every own key is a string and every value is a table cell.
 */
export function isTableRow(input: unknown): input is TableRow {
	const outcome = attempt(() => {
		if (!isRecord(input)) return false
		return Reflect.ownKeys(input).every(
			(key) => isString(key) && Object.hasOwn(input, key) && isTableCell(input[key]),
		)
	})

	return outcome.success && outcome.value
}

/**
 * Determine whether an unknown value is a declared column cell.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is one of the four column cells.
 */
export function isColumnCell(input: unknown): input is ColumnCell {
	return COLUMN_CELLS.some((cell) => cell === input)
}

/**
 * Determine whether an unknown value is one exact column choice record.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a column choice.
 */
export function isColumnChoice(input: unknown): input is ColumnChoice {
	const outcome = attempt(() => {
		if (!isRecord(input) || !Reflect.ownKeys(input).every((key) => isString(key))) return false
		return recordOf({ value: isString, label: isString, help: isString }, ['help'])(input)
	})

	return outcome.success && outcome.value
}

/**
 * Determine whether an unknown value is one exact discriminated table column.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a structurally valid table column.
 */
export function isTableColumn(input: unknown): input is TableColumn {
	const outcome = attempt(() => {
		if (!isRecord(input) || !Object.hasOwn(input, 'cell') || !Object.hasOwn(input, 'key')) {
			return false
		}

		const cell = input.cell
		if (!isColumnCell(cell)) return false

		const exact = Reflect.ownKeys(input).every((key) => {
			if (!isString(key)) return false
			if (['cell', 'key', 'label', 'help', 'hidden', 'meta'].includes(key)) return true
			return cell === 'choice' && key === 'choices'
		})
		if (!exact) return false

		const key = input.key
		const hasLabel = Object.hasOwn(input, 'label')
		const label = hasLabel ? input.label : undefined
		const hasHelp = Object.hasOwn(input, 'help')
		const help = hasHelp ? input.help : undefined
		const hasHidden = Object.hasOwn(input, 'hidden')
		const hidden = hasHidden ? input.hidden : undefined
		const hasMeta = Object.hasOwn(input, 'meta')
		const meta = hasMeta ? input.meta : undefined

		if (
			!isString(key) ||
			(hasLabel && !isString(label)) ||
			(hasHelp && !isString(help)) ||
			(hasHidden && !isBoolean(hidden)) ||
			(hasMeta && !isBoundedJSONRecord(meta))
		) {
			return false
		}

		if (cell !== 'choice') return !Object.hasOwn(input, 'choices')
		return Object.hasOwn(input, 'choices') && arrayOf(isColumnChoice)(input.choices)
	})

	return outcome.success && outcome.value
}

/**
 * Determine whether an unknown value has one exact structural table-schema shape.
 *
 * @param input - The value to inspect.
 * @returns Whether the value has the exact structure of a table schema.
 */
export function isStructuralTableSchema(input: unknown): input is TableSchema {
	const outcome = attempt(() => {
		if (!isRecord(input) || !Reflect.ownKeys(input).every((key) => isString(key))) return false
		return recordOf(
			{
				name: isString,
				label: isString,
				help: isString,
				key: isString,
				columns: arrayOf(isTableColumn),
			},
			['name', 'label', 'help'],
		)(input)
	})

	return outcome.success && outcome.value
}

/**
 * Determine whether an unknown value is one semantically sound table schema.
 *
 * @param input - The value to inspect.
 * @returns Whether the value has valid structure, domain relationships, and budgets.
 */
export function isTableSchema(input: unknown): input is TableSchema {
	const outcome = attempt(() => isStructuralTableSchema(input) && auditTable(input).length === 0)
	return outcome.success && outcome.value
}
