import type { Emitter } from '@orkestrel/emitter'
import type { ExpansionManagerInterface, TableEventMap, TableKey } from '../types.js'
import { computeKeys } from '../helpers.js'

/** The keys of the rows somebody has opened. */
export class ExpansionManager implements ExpansionManagerInterface {
	readonly #emitter: Emitter<TableEventMap>
	readonly #gate: () => void
	readonly #rows: () => readonly TableKey[]
	readonly #read: () => ReadonlySet<TableKey>
	readonly #write: (keys: ReadonlySet<TableKey>) => void

	/**
	 * Create an expansion manager over one table's private stores.
	 *
	 * @param emitter - The table's event emitter.
	 * @param gate - The table lifecycle gate.
	 * @param rows - A read of every row key.
	 * @param read - A read of the expanded keys.
	 * @param write - The expanded-key commit boundary.
	 */
	constructor(
		emitter: Emitter<TableEventMap>,
		gate: () => void,
		rows: () => readonly TableKey[],
		read: () => ReadonlySet<TableKey>,
		write: (keys: ReadonlySet<TableKey>) => void,
	) {
		this.#emitter = emitter
		this.#gate = gate
		this.#rows = rows
		this.#read = read
		this.#write = write
	}

	/** The keys of the rows opened right now. */
	get keys(): ReadonlySet<TableKey> {
		return new Set(this.#read())
	}

	/** Open every row the table holds. */
	expand(): void
	/** Open one row. */
	expand(key: TableKey): boolean
	/** Open several rows. */
	expand(keys: readonly TableKey[]): boolean
	/** Open one or more rows. */
	expand(input?: TableKey | readonly TableKey[]): void | boolean {
		this.#gate()
		return this.#change(input, () => true)
	}

	/** Close every row. */
	clear(): void
	/** Close one row. */
	clear(key: TableKey): boolean
	/** Close several rows. */
	clear(keys: readonly TableKey[]): boolean
	/** Close one or more rows. */
	clear(input?: TableKey | readonly TableKey[]): void | boolean {
		this.#gate()
		return this.#change(input, () => false)
	}

	/** Open one row or close it when already open. */
	toggle(key: TableKey): boolean
	/** Turn several rows around independently. */
	toggle(keys: readonly TableKey[]): boolean
	/** Turn one or more rows around independently. */
	toggle(input: TableKey | readonly TableKey[]): boolean {
		this.#gate()
		return this.#change(input, (included) => !included) === true
	}

	#change(
		input: TableKey | readonly TableKey[] | undefined,
		include: (included: boolean) => boolean,
	): void | boolean {
		const previous = this.#read()
		const next = computeKeys(this.#rows(), previous, input, include)
		if (next === undefined) return false
		if (next !== previous) {
			this.#write(next)
			this.#emitter.emit('expand', new Set(next))
		}

		return input === undefined ? undefined : true
	}
}
