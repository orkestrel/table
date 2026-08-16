import type { Emitter } from '@orkestrel/emitter'
import type { SortManagerInterface, TableEventMap, TableOrder, TableSchema } from '../types.js'
import { TableError } from '../errors.js'
import { extractColumn } from '../helpers.js'

/** The ordered sort terms of one table. */
export class SortManager implements SortManagerInterface {
	readonly #schema: TableSchema
	readonly #emitter: Emitter<TableEventMap>
	readonly #gate: () => void
	readonly #read: () => readonly TableOrder[]
	readonly #write: (orders: readonly TableOrder[]) => void

	/**
	 * Create a sort manager over one table's private term store.
	 *
	 * @param schema - The table schema.
	 * @param emitter - The table's event emitter.
	 * @param gate - The table lifecycle gate.
	 * @param read - A read of the current terms.
	 * @param write - The term commit boundary.
	 */
	constructor(
		schema: TableSchema,
		emitter: Emitter<TableEventMap>,
		gate: () => void,
		read: () => readonly TableOrder[],
		write: (orders: readonly TableOrder[]) => void,
	) {
		this.#schema = schema
		this.#emitter = emitter
		this.#gate = gate
		this.#read = read
		this.#write = write
	}

	/** Find one column's sort term. */
	order(column: string): TableOrder | undefined {
		const order = this.#read().find((candidate) => candidate.column === column)
		return order === undefined ? undefined : Object.freeze({ ...order })
	}

	/** Read every sort term as an owned frozen snapshot. */
	orders(): readonly TableOrder[] {
		return Object.freeze(this.#read().map((order) => Object.freeze({ ...order })))
	}

	/** Sort by several columns. */
	set(orders: readonly TableOrder[]): void
	/** Sort by one column. */
	set(order: TableOrder): void
	/** Sort by one column or several. */
	set(input: TableOrder | readonly TableOrder[]): void {
		this.#gate()
		const requested = Array.isArray(input) ? input : [input]
		for (const order of requested) this.#require(order.column)

		const next = [...this.#read()]
		for (const order of requested) {
			const owned = Object.freeze({ ...order })
			const index = next.findIndex((candidate) => candidate.column === order.column)
			if (index === -1) next.push(owned)
			else next[index] = owned
		}

		if (this.#same(next, this.#read())) return
		const committed = Object.freeze(next)
		this.#write(committed)
		this.#emitter.emit('sort', this.orders())
	}

	/** Stop sorting by every column. */
	remove(): void
	/** Stop sorting by one column. */
	remove(column: string): boolean
	/** Stop sorting by several columns. */
	remove(columns: readonly string[]): boolean
	/** Stop sorting by one or more columns. */
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
		const next = this.#read().filter((order) => !removed.has(order.column))
		if (next.length !== this.#read().length) {
			this.#write(Object.freeze(next))
			this.#emitter.emit('sort', this.orders())
		}

		return input === undefined ? undefined : true
	}

	#require(column: string): void {
		if (extractColumn(this.#schema, column) === undefined) {
			throw new TableError('COLUMN', `The schema declares no column named "${column}"`, { column })
		}
	}

	#same(left: readonly TableOrder[], right: readonly TableOrder[]): boolean {
		return (
			left.length === right.length &&
			left.every((order, index) => {
				const other = right[index]
				return (
					other !== undefined &&
					order.column === other.column &&
					order.direction === other.direction
				)
			})
		)
	}
}
