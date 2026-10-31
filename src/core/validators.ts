import type {
	ColumnCell,
	ColumnChoice,
	GridCell,
	GridColumn,
	GridRow,
	GridSchema,
} from './types.js'
import {
	arrayOf,
	attempt,
	cloneJSONRecord,
	isBoolean,
	isBoundedJSONRecord,
	isFiniteNumber,
	isRecord,
	isString,
	recordOf,
	unionOf,
} from '@orkestrel/contract'
import { COLUMN_CELLS } from './constants.js'
import { auditGrid } from './helpers.js'

/**
 * Determines whether an unknown value has a grid cell shape — a string, a finite number, or a
 * boolean.
 *
 * @param input - The value to inspect.
 * @returns True if the value is a string, finite number, or boolean; false otherwise.
 */
export function isGridCell(input: unknown): input is GridCell {
	return unionOf(isString, isFiniteNumber, isBoolean)(input)
}

/**
 * Determines whether an unknown value is a record whose every own key is a string and every value
 * a {@link GridCell}.
 *
 * @param input - The value to inspect.
 * @returns True if every own key is a string and every value is a grid cell; false otherwise.
 */
export function isGridRow(input: unknown): input is GridRow {
	const outcome = attempt(() => {
		if (!isRecord(input)) return false
		return Reflect.ownKeys(input).every(
			(key) => isString(key) && Object.hasOwn(input, key) && isGridCell(input[key]),
		)
	})

	return outcome.success && outcome.value
}

/**
 * Determines whether an unknown value is a declared column cell.
 *
 * @param input - The value to inspect.
 * @returns True if the value is a declared column cell; false otherwise.
 */
export function isColumnCell(input: unknown): input is ColumnCell {
	return COLUMN_CELLS.some((cell) => cell === input)
}

/**
 * Determines whether an unknown value is one exact {@link ColumnChoice} record; an unknown member
 * refuses it.
 *
 * @param input - The value to inspect.
 * @returns True if the value is a column choice; false otherwise.
 */
export function isColumnChoice(input: unknown): input is ColumnChoice {
	const outcome = attempt(() => {
		if (!isRecord(input) || !Reflect.ownKeys(input).every((key) => isString(key))) return false
		return recordOf({ value: isString, label: isString, help: isString }, ['help'])(input)
	})

	return outcome.success && outcome.value
}

/**
 * Determines whether an unknown value is one exact discriminated {@link GridColumn}, checked
 * against its cell's own options.
 *
 * @param input - The value to inspect.
 * @returns True if the value is a structurally valid grid column; false otherwise.
 */
export function isGridColumn(input: unknown): input is GridColumn {
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
		if (hasMeta) {
			if (!isBoundedJSONRecord(meta)) return false
			const owned = attempt(() => cloneJSONRecord(meta))
			if (!owned.success) return false
		}

		if (
			!isString(key) ||
			(hasLabel && !isString(label)) ||
			(hasHelp && !isString(help)) ||
			(hasHidden && !isBoolean(hidden))
		) {
			return false
		}

		if (cell !== 'choice') return !Object.hasOwn(input, 'choices')
		return Object.hasOwn(input, 'choices') && arrayOf(isColumnChoice)(input.choices)
	})

	return outcome.success && outcome.value
}

/**
 * Determines whether an unknown value has the exact shape of a {@link GridSchema} — the shape
 * alone, with no domain check.
 *
 * @param input - The value to inspect.
 * @returns True if the value has the exact structure of a grid schema; false otherwise.
 */
export function isStructuralGridSchema(input: unknown): input is GridSchema {
	const outcome = attempt(() => {
		if (!isRecord(input) || !Reflect.ownKeys(input).every((key) => isString(key))) return false
		return recordOf(
			{
				name: isString,
				label: isString,
				help: isString,
				key: isString,
				columns: arrayOf(isGridColumn),
			},
			['name', 'label', 'help'],
		)(input)
	})

	return outcome.success && outcome.value
}

/**
 * Determines whether an unknown value is a {@link GridSchema} a grid can be opened against —
 * the exact shape, and an audit that finds nothing.
 *
 * @param input - The value to inspect.
 * @returns True if the value has valid structure, domain relationships, and
 *   budgets; false otherwise.
 */
export function isGridSchema(input: unknown): input is GridSchema {
	const outcome = attempt(() => isStructuralGridSchema(input) && auditGrid(input).length === 0)
	return outcome.success && outcome.value
}
