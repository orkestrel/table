import type { Emitter } from '@orkestrel/emitter'
import type { ExpansionManagerInterface, GridEventMap, GridKey } from '../types.js'
import { KeyManager } from './KeyManager.js'

/** Manages the keys of the rows somebody has opened. */
export class ExpansionManager implements ExpansionManagerInterface {
	readonly #keys: KeyManager

	/**
	 * Creates an expansion manager over one grid's private stores.
	 *
	 * @param emitter - The grid's event emitter.
	 * @param gate - The grid lifecycle gate.
	 * @param rows - A read of every row key.
	 * @param read - A read of the expanded keys.
	 * @param write - The expanded-key commit boundary.
	 */
	constructor(
		emitter: Emitter<GridEventMap>,
		gate: () => void,
		rows: () => readonly GridKey[],
		read: () => ReadonlySet<GridKey>,
		write: (keys: ReadonlySet<GridKey>) => void,
	) {
		this.#keys = new KeyManager(emitter, 'expand', gate, rows, read, write)
	}

	/** Returns the keys of the rows opened. */
	get keys(): ReadonlySet<GridKey> {
		return this.#keys.keys
	}

	/** Opens every row the grid holds. */
	expand(): void
	/** Opens one row. */
	expand(key: GridKey): boolean
	/** Opens several rows. */
	expand(keys: readonly GridKey[]): boolean
	/** Opens one or more rows. */
	expand(input?: GridKey | readonly GridKey[]): void | boolean {
		return this.#keys.change(input, () => true)
	}

	/** Closes every row. */
	clear(): void
	/** Closes one row. */
	clear(key: GridKey): boolean
	/** Closes several rows. */
	clear(keys: readonly GridKey[]): boolean
	/** Closes one or more rows. */
	clear(input?: GridKey | readonly GridKey[]): void | boolean {
		return this.#keys.change(input, () => false)
	}

	/** Opens one row or closes it when already open. */
	toggle(key: GridKey): boolean
	/** Turns several rows around independently. */
	toggle(keys: readonly GridKey[]): boolean
	/** Turns one or more rows around independently. */
	toggle(input: GridKey | readonly GridKey[]): boolean {
		return this.#keys.change(input, (included) => !included) === true
	}
}
