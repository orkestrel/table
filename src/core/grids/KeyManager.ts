import type { Emitter } from '@orkestrel/emitter'
import type { GridEventMap, GridKey } from '../types.js'
import { computeKeys } from '../helpers.js'

/** Manages the key set one grid axis holds, and the event it announces when that set moves. */
export class KeyManager {
	readonly #emitter: Emitter<GridEventMap>
	readonly #event: 'select' | 'expand'
	readonly #gate: () => void
	readonly #rows: () => readonly GridKey[]
	readonly #read: () => ReadonlySet<GridKey>
	readonly #write: (keys: ReadonlySet<GridKey>) => void

	/**
	 * Creates a key-set shell over one grid's private store.
	 *
	 * @param emitter - The grid's event emitter.
	 * @param event - The event this axis announces when its key set moves.
	 * @param gate - The grid lifecycle gate.
	 * @param rows - A read of every row key.
	 * @param read - A read of the held keys.
	 * @param write - The held-key commit boundary.
	 */
	constructor(
		emitter: Emitter<GridEventMap>,
		event: 'select' | 'expand',
		gate: () => void,
		rows: () => readonly GridKey[],
		read: () => ReadonlySet<GridKey>,
		write: (keys: ReadonlySet<GridKey>) => void,
	) {
		this.#emitter = emitter
		this.#event = event
		this.#gate = gate
		this.#rows = rows
		this.#read = read
		this.#write = write
	}

	/** Returns the keys held. */
	get keys(): ReadonlySet<GridKey> {
		return new Set(this.#read())
	}

	/**
	 * Applies one atomic 0/1/N membership change, announcing it only when the set moves.
	 *
	 * @param input - Every known key, one key, or a key list.
	 * @param include - Decides the next membership from each key's membership at that step.
	 * @returns `undefined` for the no-argument form, `false` when any requested key names no row
	 *   the grid holds, and `true` otherwise.
	 */
	change(
		input: GridKey | readonly GridKey[] | undefined,
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
