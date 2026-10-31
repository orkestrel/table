import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	CellComparator,
	CellMatcher,
	ExpansionManagerInterface,
	FilterManagerInterface,
	PaginationManagerInterface,
	RowManagerInterface,
	SelectionManagerInterface,
	SortManagerInterface,
	GridEventMap,
	GridFilter,
	GridInterface,
	GridKey,
	GridOptions,
	GridOrder,
	GridRow,
	GridSchema,
} from './types.js'
import { attempt } from '@orkestrel/contract'
import { Emitter } from '@orkestrel/emitter'
import { cloneRow, cloneGridSchema } from './cloners.js'
import { isGridError, GridError } from './errors.js'
import { auditGrid, extractGridKey, filterGridRows, sortGridRows } from './helpers.js'
import { ExpansionManager } from './grids/ExpansionManager.js'
import { FilterManager } from './grids/FilterManager.js'
import { PaginationManager } from './grids/PaginationManager.js'
import { RowManager } from './grids/RowManager.js'
import { SelectionManager } from './grids/SelectionManager.js'
import { SortManager } from './grids/SortManager.js'
import { isStructuralGridSchema } from './validators.js'

/**
 * Holds a schema, its rows, and the lens through which they are read, implementing
 * {@link GridInterface} exactly.
 */
export class Grid implements GridInterface {
	readonly #emitter: Emitter<GridEventMap>
	readonly #schema: GridSchema
	readonly #comparators: Readonly<Record<string, CellComparator>> | undefined
	readonly #matchers: Readonly<Record<string, CellMatcher>> | undefined
	readonly #initialLimit: number | undefined
	#rowStore: readonly GridRow[] = Object.freeze([])
	#orderStore: readonly GridOrder[] = Object.freeze([])
	#filterStore: readonly GridFilter[] = Object.freeze([])
	#selected: ReadonlySet<GridKey> = new Set()
	#expanded: ReadonlySet<GridKey> = new Set()
	#page = 1
	#limit: number | undefined
	#destroyed = false
	readonly #rows: RowManager
	readonly #sort: SortManager
	readonly #filter: FilterManager
	readonly #selection: SelectionManager
	readonly #expansion: ExpansionManager
	readonly #pagination: PaginationManager

	/**
	 * Opens a grid against a schema.
	 *
	 * @param schema - The grid declaration to own.
	 * @param options - Initial rows, lens overrides, pagination, and emitter wiring.
	 * @throws A {@link GridError} coded `SCHEMA` when the schema is unusable, `KEY` when a seeded
	 *   identity is unusable or repeated, and `CELL` when a seeded cell is invalid.
	 */
	constructor(schema: GridSchema, options?: GridOptions) {
		const unusable = 'The schema is not a grid schema'
		const owned = isStructuralGridSchema(schema)
			? attempt(() => cloneGridSchema(schema))
			: undefined
		if (owned !== undefined && !owned.success && isGridError(owned.error)) throw owned.error
		if (owned === undefined || !owned.success) {
			throw new GridError('SCHEMA', `The grid schema is unusable: ${unusable}`, {
				problems: [unusable],
			})
		}

		const problems = isStructuralGridSchema(owned.value) ? auditGrid(owned.value) : [unusable]
		if (problems.length > 0) {
			throw new GridError('SCHEMA', `The grid schema is unusable: ${problems.join('; ')}`, {
				problems: [...problems],
			})
		}

		this.#schema = owned.value
		this.#comparators =
			options?.comparators === undefined ? undefined : Object.freeze({ ...options.comparators })
		this.#matchers =
			options?.matchers === undefined ? undefined : Object.freeze({ ...options.matchers })
		this.#limit = options?.limit
		this.#emitter = new Emitter<GridEventMap>({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})

		this.#selection = new SelectionManager(
			this.#emitter,
			() => this.#gate(),
			() => this.#keys(),
			() => this.#selected,
			(keys) => {
				this.#selected = keys
			},
		)
		this.#expansion = new ExpansionManager(
			this.#emitter,
			() => this.#gate(),
			() => this.#keys(),
			() => this.#expanded,
			(keys) => {
				this.#expanded = keys
			},
		)
		this.#pagination = new PaginationManager(
			this.#emitter,
			() => this.#gate(),
			() => this.count,
			() => this.#page,
			(page) => {
				this.#page = page
			},
			() => this.#limit,
			(limit) => {
				this.#limit = limit
			},
		)
		this.#initialLimit = this.#limit
		this.#sort = new SortManager(
			this.#schema,
			this.#emitter,
			() => this.#gate(),
			() => this.#orderStore,
			(orders) => {
				this.#orderStore = orders
			},
		)
		this.#filter = new FilterManager(
			this.#schema,
			this.#emitter,
			() => this.#gate(),
			() => this.#filterStore,
			(filters) => {
				this.#filterStore = filters
			},
			() => this.#clamp(),
		)
		this.#rows = new RowManager(
			this.#schema,
			this.#emitter,
			() => this.#gate(),
			() => this.#rowStore,
			(rows) => {
				this.#rowStore = rows
			},
			(removed, announce) => this.#settle(removed, announce),
			options?.rows,
		)
	}

	/** Holds the grid's event emitter. */
	get emitter(): EmitterInterface<GridEventMap> {
		return this.#emitter
	}

	/** Holds the owned frozen schema. */
	get schema(): GridSchema {
		return this.#schema
	}

	/** Manages the rows the grid holds. */
	get rows(): RowManagerInterface {
		return this.#rows
	}

	/** Manages the ordered sort terms. */
	get sort(): SortManagerInterface {
		return this.#sort
	}

	/** Manages the filters applied with and-only composition. */
	get filter(): FilterManagerInterface {
		return this.#filter
	}

	/** Manages the selected row keys. */
	get selection(): SelectionManagerInterface {
		return this.#selection
	}

	/** Manages the expanded row keys. */
	get expansion(): ExpansionManagerInterface {
		return this.#expansion
	}

	/** Manages the page arithmetic. */
	get pagination(): PaginationManagerInterface {
		return this.#pagination
	}

	/** Returns the filtered, sorted, and paged rows as owned frozen snapshots. */
	get view(): readonly GridRow[] {
		const ordered = sortGridRows(
			this.#schema,
			this.#filtered(),
			this.#orderStore,
			this.#comparators,
		)
		const limit = this.#limit
		const page =
			limit === undefined
				? ordered
				: ordered.slice(this.#pagination.offset, this.#pagination.offset + limit)
		return Object.freeze(page.map((row) => cloneRow(row)))
	}

	/** Returns the number of rows admitted by the filters. */
	get count(): number {
		return this.#filtered().length
	}

	/** Reports whether the grid has been torn down. */
	get destroyed(): boolean {
		return this.#destroyed
	}

	/** Resets every moving axis to its opening state. */
	clear(): void {
		this.#gate()
		const changed =
			this.#rowStore.length > 0 ||
			this.#orderStore.length > 0 ||
			this.#filterStore.length > 0 ||
			this.#selected.size > 0 ||
			this.#expanded.size > 0 ||
			this.#page !== 1 ||
			this.#limit !== this.#initialLimit
		if (!changed) return

		this.#rowStore = Object.freeze([])
		this.#orderStore = Object.freeze([])
		this.#filterStore = Object.freeze([])
		this.#selected = new Set()
		this.#expanded = new Set()
		this.#page = 1
		this.#limit = this.#initialLimit
		this.#emitter.emit('clear')
	}

	/** Tears the grid down while leaving every getter readable. */
	destroy(): void {
		if (this.#destroyed) return
		this.#destroyed = true
		this.#emitter.destroy()
	}

	#filtered(): readonly GridRow[] {
		return filterGridRows(this.#schema, this.#rowStore, this.#filterStore, this.#matchers)
	}

	#keys(): readonly GridKey[] {
		return this.#rowStore.flatMap((row) => {
			const key = extractGridKey(this.#schema, row)
			return key === undefined ? [] : [key]
		})
	}

	#settle(removed: readonly GridKey[], announce: () => void): void {
		const keys = new Set(removed)
		const selected = new Set([...this.#selected].filter((key) => !keys.has(key)))
		const expanded = new Set([...this.#expanded].filter((key) => !keys.has(key)))
		const selectedChanged = selected.size !== this.#selected.size
		const expandedChanged = expanded.size !== this.#expanded.size

		if (selectedChanged) this.#selected = selected
		if (expandedChanged) this.#expanded = expanded
		const page = this.#clamp()

		announce()
		if (selectedChanged) this.#emitter.emit('select', new Set(selected))
		if (expandedChanged) this.#emitter.emit('expand', new Set(expanded))
		if (page !== undefined) this.#emitter.emit('paginate', page)
	}

	#clamp(): number | undefined {
		const page = Math.min(this.#page, this.#pagination.count)
		if (page === this.#page) return undefined
		this.#page = page
		return page
	}

	#gate(): void {
		if (this.#destroyed) {
			throw new GridError('DESTROYED', 'The grid was destroyed and cannot change')
		}
	}
}
