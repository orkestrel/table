import type { Emitter } from '@orkestrel/emitter'
import type { SelectionManagerInterface, TableEventMap, TableKey } from '../types.js'
import { computeKeys } from '../helpers.js'

/** The keys of the rows somebody has picked. */
export class SelectionManager implements SelectionManagerInterface {
	readonly #emitter: Emitter<TableEventMap>
	readonly #gate: () => void
	readonly #rows: () => readonly TableKey[]
	readonly #read: () => ReadonlySet<TableKey>
	readonly #write: (keys: ReadonlySet<TableKey>) => void

	/**
	 * Create a selection manager over one table's private stores.
	 *
	 * @param emitter - The table's event emitter.
	 * @param gate - The table lifecycle gate.
	 * @param rows - A read of every row key.
	 * @param read - A read of the selected keys.
	 * @param write - The selected-key commit boundary.
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

	/** The keys of the rows picked right now. */
	get keys(): ReadonlySet<TableKey> {
		return new Set(this.#read())
	}

	/** Pick every row the table holds. */
	select(): void
	/** Pick one row. */
	select(key: TableKey): boolean
	/** Pick several rows. */
	select(keys: readonly TableKey[]): boolean
	/** Pick one or more rows. */
	select(input?: TableKey | readonly TableKey[]): void | boolean {
		this.#gate()
		return this.#change(input, () => true)
	}

	/** Drop every pick. */
	clear(): void
	/** Drop one pick. */
	clear(key: TableKey): boolean
	/** Drop several picks. */
	clear(keys: readonly TableKey[]): boolean
	/** Drop one or more picks. */
	clear(input?: TableKey | readonly TableKey[]): void | boolean {
		this.#gate()
		return this.#change(input, () => false)
	}

	/** Pick one row or drop it when already picked. */
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
			this.#emitter.emit('select', new Set(next))
		}

		return input === undefined ? undefined : true
	}
}
