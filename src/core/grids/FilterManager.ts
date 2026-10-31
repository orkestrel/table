import type { Emitter } from '@orkestrel/emitter'
import type { FilterManagerInterface, GridEventMap, GridFilter, GridSchema } from '../types.js'
import { isArray } from '@orkestrel/contract'
import { GridError } from '../errors.js'
import { admitsFilter, extractColumn, matchesTerms, mergeTerms, removeTerms } from '../helpers.js'

/** Manages the filters one grid applies with and-only composition. */
export class FilterManager implements FilterManagerInterface {
	readonly #schema: GridSchema
	readonly #emitter: Emitter<GridEventMap>
	readonly #gate: () => void
	readonly #read: () => readonly GridFilter[]
	readonly #write: (filters: readonly GridFilter[]) => void
	readonly #clamp: () => number | undefined

	/**
	 * Creates a filter manager over one grid's private filter store.
	 *
	 * @param schema - The grid schema.
	 * @param emitter - The grid's event emitter.
	 * @param gate - The grid lifecycle gate.
	 * @param read - A read of the current filters.
	 * @param write - The filter commit boundary.
	 * @param clamp - The pagination clamp commit after a filter commit.
	 */
	constructor(
		schema: GridSchema,
		emitter: Emitter<GridEventMap>,
		gate: () => void,
		read: () => readonly GridFilter[],
		write: (filters: readonly GridFilter[]) => void,
		clamp: () => number | undefined,
	) {
		this.#schema = schema
		this.#emitter = emitter
		this.#gate = gate
		this.#read = read
		this.#write = write
		this.#clamp = clamp
	}

	/** Finds one column's filter. */
	filter(column: string): GridFilter | undefined {
		const filter = this.#read().find((candidate) => candidate.column === column)
		return filter === undefined ? undefined : Object.freeze({ ...filter })
	}

	/** Reads every filter as an owned frozen snapshot. */
	filters(): readonly GridFilter[] {
		return Object.freeze(this.#read().map((filter) => Object.freeze({ ...filter })))
	}

	/** Filters several columns. */
	set(filters: readonly GridFilter[]): void
	/** Filters one column. */
	set(filter: GridFilter): void
	/** Filters one column or several. */
	set(input: GridFilter | readonly GridFilter[]): void {
		this.#gate()
		const requested = isArray(input) ? input : [input]
		for (const filter of requested) this.#validate(filter)

		const next = mergeTerms(this.#read(), requested)
		if (matchesTerms(next, this.#read(), (filter, other) => this.#operands(filter, other))) return
		this.#write(next)
		const page = this.#clamp()
		this.#emitter.emit('filter', this.filters())
		if (page !== undefined) this.#emitter.emit('paginate', page)
	}

	/** Stops filtering by every column. */
	remove(): void
	/** Stops filtering by one column. */
	remove(column: string): boolean
	/** Stops filtering by several columns. */
	remove(columns: readonly string[]): boolean
	/** Stops filtering by one or more columns. */
	remove(input?: string | readonly string[]): void | boolean {
		this.#gate()
		const columns =
			input === undefined
				? this.#schema.columns.map((column) => column.key)
				: isArray(input)
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

	#validate(filter: GridFilter): void {
		const column = extractColumn(this.#schema, filter.column)
		if (column === undefined) {
			throw new GridError('COLUMN', `The schema declares no column named "${filter.column}"`, {
				column: filter.column,
			})
		}

		if (!admitsFilter(column, filter)) {
			throw new GridError('CELL', `Column "${filter.column}" cannot apply that filter`, {
				column: filter.column,
			})
		}
	}

	#operands(left: GridFilter, right: GridFilter): boolean {
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
