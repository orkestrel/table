import type { Emitter } from '@orkestrel/emitter'
import type { ExpansionManagerInterface, TableEventMap, TableKey } from '../types.js'
import { KeyManager } from './KeyManager.js'

/** Manages the keys of the rows somebody has opened. */
export class ExpansionManager implements ExpansionManagerInterface {
	readonly #keys: KeyManager

	/**
	 * Creates an expansion manager over one table's private stores.
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
		this.#keys = new KeyManager(emitter, 'expand', gate, rows, read, write)
	}

	/** Returns the keys of the rows opened right now. */
	get keys(): ReadonlySet<TableKey> {
		return this.#keys.keys
	}

	/** Opens every row the table holds. */
	expand(): void
	/** Opens one row. */
	expand(key: TableKey): boolean
	/** Opens several rows. */
	expand(keys: readonly TableKey[]): boolean
	/** Opens one or more rows. */
	expand(input?: TableKey | readonly TableKey[]): void | boolean {
		return this.#keys.change(input, () => true)
	}

	/** Closes every row. */
	clear(): void
	/** Closes one row. */
	clear(key: TableKey): boolean
	/** Closes several rows. */
	clear(keys: readonly TableKey[]): boolean
	/** Closes one or more rows. */
	clear(input?: TableKey | readonly TableKey[]): void | boolean {
		return this.#keys.change(input, () => false)
	}

	/** Opens one row or closes it when already open. */
	toggle(key: TableKey): boolean
	/** Turns several rows around independently. */
	toggle(keys: readonly TableKey[]): boolean
	/** Turns one or more rows around independently. */
	toggle(input: TableKey | readonly TableKey[]): boolean {
		return this.#keys.change(input, (included) => !included) === true
	}
}
