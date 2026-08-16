import type { Emitter } from '@orkestrel/emitter'
import type { FilterManagerInterface, TableEventMap, TableFilter, TableSchema } from '../types.js'
import { STRING_LIMIT } from '../constants.js'
import { TableError } from '../errors.js'
import { extractColumn, matchesCell } from '../helpers.js'

/** The filters one table applies with and-only composition. */
export class FilterManager implements FilterManagerInterface {
	readonly #schema: TableSchema
	readonly #emitter: Emitter<TableEventMap>
	readonly #gate: () => void
	readonly #read: () => readonly TableFilter[]
	readonly #write: (filters: readonly TableFilter[]) => void
	readonly #clamp: () => void

	/**
	 * Create a filter manager over one table's private filter store.
	 *
	 * @param schema - The table schema.
	 * @param emitter - The table's event emitter.
	 * @param gate - The table lifecycle gate.
	 * @param read - A read of the current filters.
	 * @param write - The filter commit boundary.
	 * @param clamp - The pagination clamp after a filter commit.
	 */
	constructor(
		schema: TableSchema,
		emitter: Emitter<TableEventMap>,
		gate: () => void,
		read: () => readonly TableFilter[],
		write: (filters: readonly TableFilter[]) => void,
		clamp: () => void,
	) {
		this.#schema = schema
		this.#emitter = emitter
		this.#gate = gate
		this.#read = read
		this.#write = write
		this.#clamp = clamp
	}

	/** Find one column's filter. */
	filter(column: string): TableFilter | undefined {
		const filter = this.#read().find((candidate) => candidate.column === column)
		return filter === undefined ? undefined : Object.freeze({ ...filter })
	}

	/** Read every filter as an owned frozen snapshot. */
	filters(): readonly TableFilter[] {
		return Object.freeze(this.#read().map((filter) => Object.freeze({ ...filter })))
	}

	/** Filter several columns. */
	set(filters: readonly TableFilter[]): void
	/** Filter one column. */
	set(filter: TableFilter): void
	/** Filter one column or several. */
	set(input: TableFilter | readonly TableFilter[]): void {
		this.#gate()
		const requested = Array.isArray(input) ? input : [input]
		for (const filter of requested) this.#validate(filter)

		const next = [...this.#read()]
		for (const filter of requested) {
			const owned = Object.freeze({ ...filter })
			const index = next.findIndex((candidate) => candidate.column === filter.column)
			if (index === -1) next.push(owned)
			else next[index] = owned
		}

		if (this.#same(next, this.#read())) return
		this.#write(Object.freeze(next))
		this.#emitter.emit('filter', this.filters())
		this.#clamp()
	}

	/** Stop filtering by every column. */
	remove(): void
	/** Stop filtering by one column. */
	remove(column: string): boolean
	/** Stop filtering by several columns. */
	remove(columns: readonly string[]): boolean
	/** Stop filtering by one or more columns. */
	remove(input?: string | readonly string[]): void | boolean {
		this.#gate()
		const columns =
			input === undefined
				? this.#schema.columns.map((column) => column.key)
				: Array.isArray(input)
					? input
					: [input]
		for (const column of columns) {
			if (extractColumn(this.#schema, column) === undefined) return false
		}

		const removed = new Set(columns)
		const next = this.#read().filter((filter) => !removed.has(filter.column))
		if (next.length !== this.#read().length) {
			this.#write(Object.freeze(next))
			this.#emitter.emit('filter', this.filters())
			this.#clamp()
		}

		return input === undefined ? undefined : true
	}

	#validate(filter: TableFilter): void {
		const column = extractColumn(this.#schema, filter.column)
		if (column === undefined) {
			throw new TableError('COLUMN', `The schema declares no column named "${filter.column}"`, {
				column: filter.column,
			})
		}

		let valid = false
		if (filter.operator === 'contains') {
			valid =
				(column.cell === 'text' || column.cell === 'choice') && filter.text.length <= STRING_LIMIT
		} else if (filter.operator === 'between') {
			valid =
				(column.cell === 'text' || column.cell === 'number') &&
				matchesCell(column, filter.minimum) &&
				matchesCell(column, filter.maximum)
		} else {
			valid = matchesCell(column, filter.value)
		}

		if (!valid) {
			throw new TableError('CELL', `Column "${filter.column}" cannot apply that filter`, {
				column: filter.column,
			})
		}
	}

	#same(left: readonly TableFilter[], right: readonly TableFilter[]): boolean {
		return (
			left.length === right.length &&
			left.every((filter, index) => {
				const other = right[index]
				if (
					other === undefined ||
					filter.column !== other.column ||
					filter.operator !== other.operator
				) {
					return false
				}
				if (filter.operator === 'contains' && other.operator === 'contains')
					return filter.text === other.text
				if (filter.operator === 'between' && other.operator === 'between') {
					return filter.minimum === other.minimum && filter.maximum === other.maximum
				}
				return (
					filter.operator === 'equals' &&
					other.operator === 'equals' &&
					filter.value === other.value
				)
			})
		)
	}
}
