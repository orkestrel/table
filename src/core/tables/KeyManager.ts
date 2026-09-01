import type { Emitter } from '@orkestrel/emitter'
import type { TableEventMap, TableKey } from '../types.js'
import { computeKeys } from '../helpers.js'

/** The key set one table axis holds, and the event it announces when that set moves. */
export class KeyManager {
	readonly #emitter: Emitter<TableEventMap>
	readonly #event: 'select' | 'expand'
	readonly #gate: () => void
	readonly #rows: () => readonly TableKey[]
	readonly #read: () => ReadonlySet<TableKey>
	readonly #write: (keys: ReadonlySet<TableKey>) => void

	/**
	 * Creates a key-set engine over one table's private store.
	 *
	 * @param emitter - The table's event emitter.
	 * @param event - The event this axis announces when its key set moves.
	 * @param gate - The table lifecycle gate.
	 * @param rows - A read of every row key.
	 * @param read - A read of the held keys.
	 * @param write - The held-key commit boundary.
	 */
	constructor(
		emitter: Emitter<TableEventMap>,
		event: 'select' | 'expand',
		gate: () => void,
		rows: () => readonly TableKey[],
		read: () => ReadonlySet<TableKey>,
		write: (keys: ReadonlySet<TableKey>) => void,
	) {
		this.#emitter = emitter
		this.#event = event
		this.#gate = gate
		this.#rows = rows
		this.#read = read
		this.#write = write
	}

	/** The keys held right now. */
	get keys(): ReadonlySet<TableKey> {
		return new Set(this.#read())
	}

	/**
	 * Applies one atomic 0/1/N membership change, announcing it only when the set moves.
	 *
	 * @param input - Every known key, one key, or a key list.
	 * @param include - Decides the next membership from each key's membership at that step.
	 * @returns `undefined` for the no-argument form, `false` when any requested key names no row
	 *   the table holds, and `true` otherwise.
	 */
	change(
		input: TableKey | readonly TableKey[] | undefined,
		include: (included: boolean) => boolean,
	): void | boolean {
		this.#gate()
		const previous = this.#read()
		const next = computeKeys(this.#rows(), previous, input, include)
		if (next === undefined) return false
		if (next !== previous) {
			this.#write(next)
			this.#emitter.emit(this.#event, new Set(next))
		}

		return input === undefined ? undefined : true
	}
}
