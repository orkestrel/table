import type { Emitter } from '@orkestrel/emitter'
import type { SortManagerInterface, GridEventMap, GridOrder, GridSchema } from '../types.js'
import { isArray } from '@orkestrel/contract'
import { GridError } from '../errors.js'
import { extractColumn, matchesTerms, mergeTerms, removeTerms } from '../helpers.js'

/** Manages the ordered sort terms of one grid. */
export class SortManager implements SortManagerInterface {
	readonly #schema: GridSchema
	readonly #emitter: Emitter<GridEventMap>
	readonly #gate: () => void
	readonly #read: () => readonly GridOrder[]
	readonly #write: (orders: readonly GridOrder[]) => void

	/**
	 * Creates a sort manager over one grid's private term store.
	 *
	 * @param schema - The grid schema.
	 * @param emitter - The grid's event emitter.
	 * @param gate - The grid lifecycle gate.
	 * @param read - A read of the current terms.
	 * @param write - The term commit boundary.
	 */
	constructor(
		schema: GridSchema,
		emitter: Emitter<GridEventMap>,
		gate: () => void,
		read: () => readonly GridOrder[],
		write: (orders: readonly GridOrder[]) => void,
	) {
		this.#schema = schema
		this.#emitter = emitter
		this.#gate = gate
		this.#read = read
		this.#write = write
	}

	/** Finds one column's sort term. */
	order(column: string): GridOrder | undefined {
		const order = this.#read().find((candidate) => candidate.column === column)
		return order === undefined ? undefined : Object.freeze({ ...order })
	}

	/** Reads every sort term as an owned frozen snapshot. */
	orders(): readonly GridOrder[] {
		return Object.freeze(this.#read().map((order) => Object.freeze({ ...order })))
	}

	/** Sorts by several columns. */
	set(orders: readonly GridOrder[]): void
	/** Sorts by one column. */
	set(order: GridOrder): void
	/** Sorts by one column or several. */
	set(input: GridOrder | readonly GridOrder[]): void {
		this.#gate()
		const requested = isArray(input) ? input : [input]
		for (const order of requested) this.#require(order.column)

		const next = mergeTerms(this.#read(), requested)
		if (matchesTerms(next, this.#read(), (order, other) => order.direction === other.direction)) {
			return
		}

		this.#write(next)
		this.#emitter.emit('sort', this.orders())
	}

	/** Stops sorting by every column. */
	remove(): void
	/** Stops sorting by one column. */
	remove(column: string): boolean
	/** Stops sorting by several columns. */
	remove(columns: readonly string[]): boolean
	/** Stops sorting by one or more columns. */
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
			this.#emitter.emit('sort', this.orders())
		}

		return input === undefined ? undefined : true
	}

	#require(column: string): void {
		if (extractColumn(this.#schema, column) === undefined) {
			throw new GridError('COLUMN', `The schema declares no column named "${column}"`, { column })
		}
	}
}
