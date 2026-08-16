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
	TableEventMap,
	TableFilter,
	TableInterface,
	TableKey,
	TableOptions,
	TableOrder,
	TableRow,
	TableSchema,
} from './types.js'
import { Emitter } from '@orkestrel/emitter'
import { cloneRow, cloneSchema } from './cloners.js'
import { TableError } from './errors.js'
import { auditTable, extractKey, filterRows, sortRows } from './helpers.js'
import { ExpansionManager } from './tables/ExpansionManager.js'
import { FilterManager } from './tables/FilterManager.js'
import { PaginationManager } from './tables/PaginationManager.js'
import { RowManager } from './tables/RowManager.js'
import { SelectionManager } from './tables/SelectionManager.js'
import { SortManager } from './tables/SortManager.js'
import { isStructuralTableSchema } from './validators.js'

/** A schema, its rows, and the lens through which they are read. */
export class Table implements TableInterface {
	readonly #emitter: Emitter<TableEventMap>
	readonly #schema: TableSchema
	readonly #comparators: Readonly<Record<string, CellComparator>> | undefined
	readonly #matchers: Readonly<Record<string, CellMatcher>> | undefined
	readonly #initialLimit: number | undefined
	#rowStore: readonly TableRow[] = Object.freeze([])
	#orderStore: readonly TableOrder[] = Object.freeze([])
	#filterStore: readonly TableFilter[] = Object.freeze([])
	#selected: ReadonlySet<TableKey> = new Set()
	#expanded: ReadonlySet<TableKey> = new Set()
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
	 * Open a table against a schema.
	 *
	 * @param schema - The table declaration to own.
	 * @param options - Initial rows, lens overrides, pagination, and emitter wiring.
	 * @throws A {@link TableError} coded `SCHEMA` when the schema is unusable, `KEY` when a seeded
	 *   identity is unusable or repeated, and `CELL` when a seeded cell is invalid.
	 */
	constructor(schema: TableSchema, options?: TableOptions) {
		const problems = isStructuralTableSchema(schema)
			? auditTable(schema)
			: ['The schema is not a table schema']
		if (problems.length > 0) {
			throw new TableError('SCHEMA', `The table schema is unusable: ${problems.join('; ')}`, {
				problems: [...problems],
			})
		}

		this.#schema = cloneSchema(schema)
		this.#comparators =
			options?.comparators === undefined ? undefined : Object.freeze({ ...options.comparators })
		this.#matchers =
			options?.matchers === undefined ? undefined : Object.freeze({ ...options.matchers })
		this.#limit = options?.limit
		this.#emitter = new Emitter<TableEventMap>({
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
			(removed) => this.#settle(removed),
			options?.rows,
		)
	}

	/** The table's event emitter. */
	get emitter(): EmitterInterface<TableEventMap> {
		return this.#emitter
	}

	/** The owned frozen schema. */
	get schema(): TableSchema {
		return this.#schema
	}

	/** The rows the table holds. */
	get rows(): RowManagerInterface {
		return this.#rows
	}

	/** The ordered sort terms. */
	get sort(): SortManagerInterface {
		return this.#sort
	}

	/** The filters applied with and-only composition. */
	get filter(): FilterManagerInterface {
		return this.#filter
	}

	/** The selected row keys. */
	get selection(): SelectionManagerInterface {
		return this.#selection
	}

	/** The expanded row keys. */
	get expansion(): ExpansionManagerInterface {
		return this.#expansion
	}

	/** The page arithmetic. */
	get pagination(): PaginationManagerInterface {
		return this.#pagination
	}

	/** The filtered, sorted, and paged rows as owned frozen snapshots. */
	get view(): readonly TableRow[] {
		const ordered = sortRows(this.#schema, this.#filtered(), this.#orderStore, this.#comparators)
		const limit = this.#limit
		const page =
			limit === undefined
				? ordered
				: ordered.slice(this.#pagination.offset, this.#pagination.offset + limit)
		return Object.freeze(page.map((row) => cloneRow(row)))
	}

	/** The number of rows admitted by the filters. */
	get count(): number {
		return this.#filtered().length
	}

	/** Whether the table has been torn down. */
	get destroyed(): boolean {
		return this.#destroyed
	}

	/** Reset every moving axis to its opening state. */
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

	/** Tear the table down while leaving every getter readable. */
	destroy(): void {
		if (this.#destroyed) return
		this.#destroyed = true
		this.#emitter.destroy()
	}

	#filtered(): readonly TableRow[] {
		return filterRows(this.#schema, this.#rowStore, this.#filterStore, this.#matchers)
	}

	#keys(): readonly TableKey[] {
		return this.#rowStore.flatMap((row) => {
			const key = extractKey(this.#schema, row)
			return key === undefined ? [] : [key]
		})
	}

	#settle(removed: readonly TableKey[]): void {
		const keys = new Set(removed)
		const selected = new Set([...this.#selected].filter((key) => !keys.has(key)))
		const expanded = new Set([...this.#expanded].filter((key) => !keys.has(key)))

		if (selected.size !== this.#selected.size) {
			this.#selected = selected
			this.#emitter.emit('select', new Set(selected))
		}
		if (expanded.size !== this.#expanded.size) {
			this.#expanded = expanded
			this.#emitter.emit('expand', new Set(expanded))
		}
		const page = this.#clamp()
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
			throw new TableError('DESTROYED', 'The table was destroyed and cannot change')
		}
	}
}
