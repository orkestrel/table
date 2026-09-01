import type { Emitter } from '@orkestrel/emitter'
import type { FilterManagerInterface, TableEventMap, TableFilter, TableSchema } from '../types.js'
import { TableError } from '../errors.js'
import { admitsFilter, extractColumn, matchesTerms, mergeTerms, removeTerms } from '../helpers.js'

/** The filters one table applies with and-only composition. */
export class FilterManager implements FilterManagerInterface {
	readonly #schema: TableSchema
	readonly #emitter: Emitter<TableEventMap>
	readonly #gate: () => void
	readonly #read: () => readonly TableFilter[]
	readonly #write: (filters: readonly TableFilter[]) => void
	readonly #clamp: () => number | undefined

	/**
	 * Create a filter manager over one table's private filter store.
	 *
	 * @param schema - The table schema.
	 * @param emitter - The table's event emitter.
	 * @param gate - The table lifecycle gate.
	 * @param read - A read of the current filters.
	 * @param write - The filter commit boundary.
	 * @param clamp - The pagination clamp commit after a filter commit.
	 */
	constructor(
		schema: TableSchema,
		emitter: Emitter<TableEventMap>,
		gate: () => void,
		read: () => readonly TableFilter[],
		write: (filters: readonly TableFilter[]) => void,
		clamp: () => number | undefined,
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

		const next = mergeTerms(this.#read(), requested)
		if (matchesTerms(next, this.#read(), (filter, other) => this.#operands(filter, other))) return
		this.#write(next)
		const page = this.#clamp()
		this.#emitter.emit('filter', this.filters())
		if (page !== undefined) this.#emitter.emit('paginate', page)
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

		const next = removeTerms(this.#read(), columns)
		if (next.length !== this.#read().length) {
			this.#write(next)
			const page = this.#clamp()
			this.#emitter.emit('filter', this.filters())
			if (page !== undefined) this.#emitter.emit('paginate', page)
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

		if (!admitsFilter(column, filter)) {
			throw new TableError('CELL', `Column "${filter.column}" cannot apply that filter`, {
				column: filter.column,
			})
		}
	}

	#operands(left: TableFilter, right: TableFilter): boolean {
		if (left.operator !== right.operator) return false
		if (left.operator === 'contains' && right.operator === 'contains') {
			return left.text === right.text
		}
		if (left.operator === 'between' && right.operator === 'between') {
			return left.minimum === right.minimum && left.maximum === right.maximum
		}
		return left.operator === 'equals' && right.operator === 'equals' && left.value === right.value
	}
}
