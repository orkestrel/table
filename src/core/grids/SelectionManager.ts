import type { Emitter } from '@orkestrel/emitter'
import type { SelectionManagerInterface, GridEventMap, GridKey } from '../types.js'
import { KeyManager } from './KeyManager.js'

/** Manages the keys of the rows somebody has picked. */
export class SelectionManager implements SelectionManagerInterface {
	readonly #keys: KeyManager

	/**
	 * Creates a selection manager over one grid's private stores.
	 *
	 * @param emitter - The grid's event emitter.
	 * @param gate - The grid lifecycle gate.
	 * @param rows - A read of every row key.
	 * @param read - A read of the selected keys.
	 * @param write - The selected-key commit boundary.
	 */
	constructor(
		emitter: Emitter<GridEventMap>,
		gate: () => void,
		rows: () => readonly GridKey[],
		read: () => ReadonlySet<GridKey>,
		write: (keys: ReadonlySet<GridKey>) => void,
	) {
		this.#keys = new KeyManager(emitter, 'select', gate, rows, read, write)
	}

	/** Returns the keys of the rows picked. */
	get keys(): ReadonlySet<GridKey> {
		return this.#keys.keys
	}

	/** Picks every row the grid holds. */
	select(): void
	/** Picks one row. */
	select(key: GridKey): boolean
	/** Picks several rows. */
	select(keys: readonly GridKey[]): boolean
	/** Picks one or more rows. */
	select(input?: GridKey | readonly GridKey[]): void | boolean {
		return this.#keys.change(input, () => true)
	}

	/** Drops every pick. */
	clear(): void
	/** Drops one pick. */
	clear(key: GridKey): boolean
	/** Drops several picks. */
	clear(keys: readonly GridKey[]): boolean
	/** Drops one or more picks. */
	clear(input?: GridKey | readonly GridKey[]): void | boolean {
		return this.#keys.change(input, () => false)
	}

	/** Picks one row or drops it when already picked. */
	toggle(key: GridKey): boolean
	/** Turns several rows around independently. */
	toggle(keys: readonly GridKey[]): boolean
	/** Turns one or more rows around independently. */
	toggle(input: GridKey | readonly GridKey[]): boolean {
		return this.#keys.change(input, (included) => !included) === true
	}
}
