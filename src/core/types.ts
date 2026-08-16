import type { JSONRecord } from '@orkestrel/contract'
import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'

/**
 * A row's identity.
 *
 * @remarks
 * Every row carries its own identity in the cell named by {@link TableSchema.key}, as a non-empty
 * string. A column's own identifier is a plain `string`; this names a row. Selection and expansion
 * hold these keys and nothing else, so a row keeps its selection through a re-sort.
 *
 * @example
 * ```ts
 * const key: TableKey = '7'
 * ```
 */
export type TableKey = string

/**
 * Every value a cell can hold.
 *
 * @remarks
 * The variant follows the column: `text` and `choice` hold a `string`, `number` holds a `number`,
 * and `flag` holds a `boolean`. A cell nobody has filled has no key in its row, so absence is
 * `undefined` and never `null` or an empty string.
 */
export type TableCell = string | number | boolean

/**
 * One row, keyed by column.
 *
 * @remarks
 * A row declares a cell for the columns it carries and omits the rest. It carries no key the
 * schema does not declare, and the table clones and freezes it at admission, so nothing a caller
 * holds afterwards can move a stored row.
 *
 * @example
 * ```ts
 * const row: TableRow = { id: '7', name: 'Ada', age: 36, active: true }
 * ```
 */
export type TableRow = Readonly<Record<string, TableCell>>

/**
 * What a column's cells hold.
 *
 * @remarks
 * The cell is the discriminant of every {@link TableColumn} variant, so choosing it fixes what the
 * cells hold, how the column compares, and which filter operators apply to it.
 *
 * A date, a time, and a timestamp are `text` holding an ISO string, because lexical order is
 * chronological order for ISO. There is no temporal cell.
 *
 * @example
 * ```ts
 * const cell: ColumnCell = 'choice'
 * ```
 */
export type ColumnCell = 'text' | 'number' | 'flag' | 'choice'

/**
 * One value a `choice` column offers.
 *
 * @remarks
 * `value` is what the cell holds and `label` is what a reader sees. `help` explains the choice.
 * The order a column declares its choices in is the order that column sorts by, which is what
 * lets a status column sort draft before live before archived rather than alphabetically.
 */
export interface ColumnChoice {
	readonly value: string
	readonly label: string
	readonly help?: string
}

/**
 * What every column carries, whatever its cells hold.
 *
 * @remarks
 * `key` names the column, and it is the name a row uses for that column's cell. `label` is the
 * heading a reader sees and `help` explains the column.
 *
 * `hidden` declares the column out of the presentation. It is still sorted, still filtered, and
 * still serialized, because hiding is what a host draws rather than what the table holds.
 *
 * There is no `sortable` and no `filterable`. Every declared column sorts and filters; whether a
 * heading offers either is the host's decision.
 *
 * `meta` is a bounded JSON carrier for whatever the schema declines to model. The table never
 * reads it, no comparison sees it, and it round-trips verbatim. This package defines no key in
 * it, so every key belongs to the host: an alignment, a format, a pixel width.
 */
export interface ColumnBase {
	readonly key: string
	readonly label?: string
	readonly help?: string
	readonly hidden?: boolean
	readonly meta?: JSONRecord
}

/** A column of text, compared lexically. */
export interface TextColumn extends ColumnBase {
	readonly cell: 'text'
}

/** A column of numbers, compared by magnitude. */
export interface NumberColumn extends ColumnBase {
	readonly cell: 'number'
}

/** A column of yes-or-no answers, compared false before true. */
export interface FlagColumn extends ColumnBase {
	readonly cell: 'flag'
}

/**
 * A column drawn from a declared list, compared by the order that list declares.
 *
 * @remarks
 * A cell holding a value the list does not offer is refused at admission.
 */
export interface ChoiceColumn extends ColumnBase {
	readonly cell: 'choice'
	readonly choices: readonly ColumnChoice[]
}

/**
 * Any column a schema can declare.
 *
 * @remarks
 * The union discriminates on `cell`, so narrowing on that member reaches each variant's own
 * members.
 *
 * @example
 * ```ts
 * function choices(column: TableColumn): readonly ColumnChoice[] {
 * 	return column.cell === 'choice' ? column.choices : []
 * }
 * ```
 */
export type TableColumn = TextColumn | NumberColumn | FlagColumn | ChoiceColumn

/**
 * Everything a table declares about itself.
 *
 * @remarks
 * The schema is data. It carries no function, so all of it crosses a wire and nothing is dropped
 * on the way.
 *
 * `columns` is the schema's column list, and the order it declares is the order a host presents.
 * `key` names the column whose cells carry row identity; it is required, it must name a declared
 * column, and the table refuses a row whose cell there is missing, empty, or not a string. There
 * is no default column, no positional fallback, and no key generation: an index is a position,
 * and a position is not an identity.
 *
 * `name`, `label`, and `help` describe the table itself.
 *
 * @example
 * ```ts
 * const schema: TableSchema = {
 * 	label: 'People',
 * 	key: 'id',
 * 	columns: [
 * 		{ cell: 'text', key: 'id', label: 'Reference' },
 * 		{ cell: 'text', key: 'name', label: 'Name' },
 * 		{ cell: 'number', key: 'age', label: 'Age' },
 * 	],
 * }
 * ```
 */
export interface TableSchema {
	readonly name?: string
	readonly label?: string
	readonly help?: string
	readonly key: string
	readonly columns: readonly TableColumn[]
}

/**
 * Which way a column sorts.
 *
 * @remarks
 * A column nobody has sorted has no {@link TableOrder} at all, so there is no third member
 * standing for unsorted.
 */
export type TableDirection = 'ascending' | 'descending'

/**
 * One column's place in the sort.
 *
 * @remarks
 * The order list is read left to right: the first term decides, and each later term breaks the
 * tie the terms before it left. Rows no term separates keep the order the table holds them in.
 *
 * @example
 * ```ts
 * const order: TableOrder = { column: 'age', direction: 'descending' }
 * ```
 */
export interface TableOrder {
	readonly column: string
	readonly direction: TableDirection
}

/**
 * How a filter tests a cell.
 *
 * @remarks
 * `contains` looks for text inside a `text` or `choice` cell. `between` accepts a cell inside a
 * pair of bounds, comparing the way the column compares. `equals` accepts a cell holding exactly
 * one value, which is what a `flag` or a `choice` asks for.
 *
 * A column needing anything else takes a {@link CellMatcher} through
 * {@link TableOptions.matchers}, so the operator set stays small and the schema stays data.
 */
export type FilterOperator = 'contains' | 'between' | 'equals'

/** Keep the rows whose cell holds this text somewhere inside it. */
export interface ContainsFilter {
	readonly column: string
	readonly operator: 'contains'
	readonly text: string
}

/**
 * Keep the rows whose cell falls between these bounds, both included.
 *
 * @remarks
 * The bounds compare the way the column compares, so a `text` column holding ISO strings takes a
 * pair of ISO strings and reads as a date range.
 */
export interface BetweenFilter {
	readonly column: string
	readonly operator: 'between'
	readonly minimum: string | number
	readonly maximum: string | number
}

/** Keep the rows whose cell holds exactly this value. */
export interface EqualsFilter {
	readonly column: string
	readonly operator: 'equals'
	readonly value: TableCell
}

/**
 * Any filter a table can hold.
 *
 * @remarks
 * The union discriminates on `operator`, so each operator carries only the operands it uses and a
 * `between` missing a bound cannot be written down.
 *
 * A table holds at most one filter per column and keeps every row all of them accept. There is no
 * either-or composition in this version.
 *
 * @example
 * ```ts
 * const filter: TableFilter = { column: 'age', operator: 'between', minimum: 30, maximum: 40 }
 * ```
 */
export type TableFilter = ContainsFilter | BetweenFilter | EqualsFilter

/**
 * Compare two cells of one column.
 *
 * @remarks
 * It replaces the comparison the column's {@link ColumnCell} fixes, for that column alone, and it
 * receives `undefined` for a row carrying no cell there. Sorting reads the result the way
 * `Array.prototype.sort` does and applies {@link TableDirection} afterwards, so a comparator
 * always describes ascending order.
 *
 * @param left - The first row's cell, or `undefined` when it carries none.
 * @param right - The second row's cell, or `undefined` when it carries none.
 * @returns A negative number when `left` sorts first, a positive number when `right` does, and
 *   zero when neither does.
 * @example
 * ```ts
 * const natural: CellComparator = (left, right) => String(left).localeCompare(String(right))
 * ```
 */
export type CellComparator = (left: TableCell | undefined, right: TableCell | undefined) => number

/**
 * Test one column's cell against a filter.
 *
 * @remarks
 * It replaces the test the column's {@link ColumnCell} fixes, for that column alone, and it
 * receives every filter the table holds against that column.
 *
 * @param cell - The row's cell, or `undefined` when it carries none.
 * @param filter - The filter the table is applying.
 * @returns `true` to keep the row.
 * @example
 * ```ts
 * const loose: CellMatcher = (cell, filter) =>
 * 	filter.operator === 'contains' && String(cell).toLowerCase().includes(filter.text.toLowerCase())
 * ```
 */
export type CellMatcher = (cell: TableCell | undefined, filter: TableFilter) => boolean

/**
 * The machine-readable code a table error carries.
 *
 * @remarks
 * `SCHEMA` rejects a malformed schema, including a `key` naming no declared column. `COLUMN`
 * names a column the schema does not declare. `KEY` reports a row identity that is missing,
 * unusable, or already taken. `CELL` reports a value the column's cell cannot hold. `DESTROYED`
 * refuses a write to a table that has been torn down.
 */
export type TableErrorCode = 'SCHEMA' | 'COLUMN' | 'KEY' | 'CELL' | 'DESTROYED'

/**
 * Everything a table announces.
 *
 * @remarks
 * Every event fires after the state it reports is committed, and only when something actually
 * moved: a write that changes nothing announces nothing.
 *
 * `write` and `remove` carry one key and fire once per row, in the order the table wrote or
 * removed them. A listener that wants the row reads it back.
 *
 * `sort` and `filter` carry the whole axis as it now stands, and `select` and `expand` carry the
 * whole key set. Each payload is owned by the listener, so nothing it holds moves underneath it.
 *
 * `paginate` carries the page the table now shows, and fires whenever the paged window moves,
 * including a clamp and a change of page size.
 *
 * `clear` is a signal, and it is the whole announcement of that reset: a clear emits no `remove`,
 * no `select`, and no `paginate` beside it.
 */
export type TableEventMap = {
	readonly write: readonly [key: TableKey]
	readonly remove: readonly [key: TableKey]
	readonly sort: readonly [orders: readonly TableOrder[]]
	readonly filter: readonly [filters: readonly TableFilter[]]
	readonly select: readonly [keys: ReadonlySet<TableKey>]
	readonly expand: readonly [keys: ReadonlySet<TableKey>]
	readonly paginate: readonly [page: number]
	readonly clear: readonly []
}

/**
 * How to open a table.
 *
 * @param options - The table's settings.
 * @remarks
 * `on` wires listeners at construction and `error` receives any throw from one of them.
 *
 * `rows` seeds the rows. Seeding announces nothing, so a table opens quietly and every later
 * write is heard.
 *
 * `comparators` and `matchers` are keyed by column key. Each entry replaces, for that column
 * alone, the comparison or the test the column's {@link ColumnCell} fixes. They are the reason no
 * function belongs in the schema: behavior is supplied where the table is opened, and the schema
 * stays data that crosses a wire whole.
 *
 * `limit` is how many rows a page holds. Leave it out and the table is not paged.
 *
 * @example
 * ```ts
 * const options: TableOptions = {
 * 	rows: [{ id: '7', name: 'Ada', age: 36 }],
 * 	limit: 25,
 * 	on: { select: (keys) => highlight(keys) },
 * }
 * ```
 */
export interface TableOptions {
	readonly on?: EmitterHooks<TableEventMap>
	readonly error?: EmitterErrorHandler
	readonly rows?: readonly TableRow[]
	readonly comparators?: Readonly<Record<string, CellComparator>>
	readonly matchers?: Readonly<Record<string, CellMatcher>>
	readonly limit?: number
}

/**
 * The rows a table holds, in the order it holds them.
 *
 * @remarks
 * This order is the table's own, and it is what the view shows when no sort term separates two
 * rows. Sorting reads it and never rewrites it.
 *
 * @example
 * ```ts
 * table.rows.add({ id: '7', name: 'Ada', age: 36 })
 * table.rows.update({ id: '7', age: 37 })
 * ```
 */
export interface RowManagerInterface {
	/**
	 * Find one row by key.
	 *
	 * @param key - The row's key.
	 * @returns The row, or `undefined` when the table holds no such key.
	 */
	row(key: TableKey): TableRow | undefined
	/**
	 * Every row the table holds, in its own order.
	 *
	 * @returns The rows, unfiltered, unsorted, and unpaged.
	 */
	rows(): readonly TableRow[]
	/**
	 * Take in several rows, appending them in the order given.
	 *
	 * @param rows - The rows to admit.
	 * @throws A {@link TableError} coded `KEY` when a row's key is missing, unusable, already
	 *   taken, or repeated inside the batch, and `CELL` when a cell is one its column cannot hold.
	 *   Every row is checked before any is admitted, so one refusal admits none of them.
	 */
	add(rows: readonly TableRow[]): void
	/**
	 * Take in one row, appending it.
	 *
	 * @param row - The row to admit.
	 * @throws A {@link TableError} coded `KEY` when the row's key is missing, unusable, or already
	 *   taken, and `CELL` when a cell is one its column cannot hold.
	 */
	add(row: TableRow): void
	/**
	 * Write over several rows, each found by the key it carries.
	 *
	 * @param rows - The rows to write, each carrying the key of the row it writes over.
	 * @returns `true` when every key named a row the table holds.
	 * @throws A {@link TableError} coded `CELL` when a cell is one its column cannot hold. Every
	 *   row is checked before any is written, so one refusal writes none of them.
	 */
	update(rows: readonly TableRow[]): boolean
	/**
	 * Write over one row, found by the key it carries.
	 *
	 * @remarks
	 * The cells given replace the cells held; the cells left out stay as they are. A row's key
	 * therefore cannot move, because a different key names a different row.
	 *
	 * @param row - The cells to write, carrying the key of the row they belong to.
	 * @returns `true` when the key named a row the table holds.
	 * @throws A {@link TableError} coded `CELL` when a cell is one its column cannot hold.
	 */
	update(row: TableRow): boolean
	/**
	 * Move one row to another place in the table's own order.
	 *
	 * @param key - The row's key.
	 * @param index - Where to put it, counted from zero and clamped to the rows that exist.
	 * @returns `true` when the key named a row the table holds.
	 */
	move(key: TableKey, index: number): boolean
	/**
	 * Take out every row.
	 *
	 * @remarks
	 * Selection and expansion drop the keys they held, because those rows are gone.
	 */
	remove(): void
	/**
	 * Take out one row.
	 *
	 * @param key - The row's key.
	 * @returns `true` when the key named a row the table holds.
	 */
	remove(key: TableKey): boolean
	/**
	 * Take out several rows.
	 *
	 * @param keys - The rows' keys.
	 * @returns `true` when every key named a row the table holds. Every key is checked before any
	 *   row goes, so one unknown key leaves the whole call undone.
	 */
	remove(keys: readonly TableKey[]): boolean
}

/**
 * The order a table reads its rows in.
 *
 * @remarks
 * The table holds one term per column and applies them in the order they were set. Which
 * direction a heading offers next is the host's decision, so there is no cycling verb here: read
 * the column's term, decide, then set or remove it.
 *
 * @example
 * ```ts
 * table.sort.set({ column: 'age', direction: 'descending' })
 * table.sort.orders() // [{ column: 'age', direction: 'descending' }]
 * ```
 */
export interface SortManagerInterface {
	/**
	 * Find one column's term.
	 *
	 * @param column - The column's key.
	 * @returns The term, or `undefined` when nothing sorts that column.
	 */
	order(column: string): TableOrder | undefined
	/**
	 * Every term the table sorts by.
	 *
	 * @returns The terms, first to last, in the order they decide.
	 */
	orders(): readonly TableOrder[]
	/**
	 * Sort by several columns.
	 *
	 * @param orders - The terms to set. A term for a column already sorted replaces that column's
	 *   direction in place; every other term joins the end of the list.
	 * @throws A {@link TableError} coded `COLUMN` when a term names a column the schema does not
	 *   declare. Every term is checked before any is set.
	 */
	set(orders: readonly TableOrder[]): void
	/**
	 * Sort by one column.
	 *
	 * @param order - The term to set.
	 * @throws A {@link TableError} coded `COLUMN` when the term names a column the schema does not
	 *   declare.
	 */
	set(order: TableOrder): void
	/** Stop sorting by anything. */
	remove(): void
	/**
	 * Stop sorting by one column.
	 *
	 * @param column - The column's key.
	 * @returns `true` when the schema declares that column.
	 */
	remove(column: string): boolean
	/**
	 * Stop sorting by several columns.
	 *
	 * @param columns - The columns' keys.
	 * @returns `true` when the schema declares every one of them. Every key is checked before any
	 *   term goes.
	 */
	remove(columns: readonly string[]): boolean
}

/**
 * Which rows a table keeps.
 *
 * @remarks
 * The table holds at most one filter per column and keeps the rows every filter accepts.
 *
 * @example
 * ```ts
 * table.filter.set({ column: 'name', operator: 'contains', text: 'ad' })
 * table.count // how many rows are left
 * ```
 */
export interface FilterManagerInterface {
	/**
	 * Find one column's filter.
	 *
	 * @param column - The column's key.
	 * @returns The filter, or `undefined` when nothing filters that column.
	 */
	filter(column: string): TableFilter | undefined
	/**
	 * Every filter the table keeps rows by.
	 *
	 * @returns The filters, in the order they were set.
	 */
	filters(): readonly TableFilter[]
	/**
	 * Filter several columns.
	 *
	 * @param filters - The filters to set. A filter for a column already filtered replaces that
	 *   column's filter; every other one joins the end of the list.
	 * @throws A {@link TableError} coded `COLUMN` when a filter names a column the schema does not
	 *   declare, and `CELL` when an operand is one the column cannot hold. Every filter is checked
	 *   before any is set.
	 */
	set(filters: readonly TableFilter[]): void
	/**
	 * Filter one column.
	 *
	 * @param filter - The filter to set.
	 * @throws A {@link TableError} coded `COLUMN` when the filter names a column the schema does
	 *   not declare, and `CELL` when an operand is one the column cannot hold.
	 */
	set(filter: TableFilter): void
	/** Stop filtering by anything. */
	remove(): void
	/**
	 * Stop filtering one column.
	 *
	 * @param column - The column's key.
	 * @returns `true` when the schema declares that column.
	 */
	remove(column: string): boolean
	/**
	 * Stop filtering several columns.
	 *
	 * @param columns - The columns' keys.
	 * @returns `true` when the schema declares every one of them. Every key is checked before any
	 *   filter goes.
	 */
	remove(columns: readonly string[]): boolean
}

/**
 * The rows somebody has picked.
 *
 * @remarks
 * Selection holds keys, never rows or positions, so a pick survives a sort, a filter, and a page
 * turn. A row that leaves the table takes its key out of the selection with it.
 *
 * @example
 * ```ts
 * table.selection.toggle('7')
 * table.selection.keys.has('7') // true
 * ```
 */
export interface SelectionManagerInterface {
	/** The keys of the rows picked right now. */
	readonly keys: ReadonlySet<TableKey>
	/**
	 * Pick every row the table holds.
	 *
	 * @remarks
	 * Every row, not every visible one. A host picking one page hands that page's keys over
	 * instead.
	 */
	select(): void
	/**
	 * Pick one row.
	 *
	 * @param key - The row's key.
	 * @returns `true` when the key named a row the table holds.
	 */
	select(key: TableKey): boolean
	/**
	 * Pick several rows.
	 *
	 * @param keys - The rows' keys.
	 * @returns `true` when every key named a row the table holds. Every key is checked before any
	 *   row is picked.
	 */
	select(keys: readonly TableKey[]): boolean
	/** Drop every pick. */
	clear(): void
	/**
	 * Drop one pick.
	 *
	 * @param key - The row's key.
	 * @returns `true` when the key named a row the table holds, whether or not it was picked.
	 */
	clear(key: TableKey): boolean
	/**
	 * Drop several picks.
	 *
	 * @param keys - The rows' keys.
	 * @returns `true` when every key named a row the table holds. Every key is checked before any
	 *   pick is dropped.
	 */
	clear(keys: readonly TableKey[]): boolean
	/**
	 * Pick one row, or drop it when it is already picked.
	 *
	 * @param key - The row's key.
	 * @returns `true` when the key named a row the table holds.
	 */
	toggle(key: TableKey): boolean
	/**
	 * Turn several rows around, each on its own.
	 *
	 * @param keys - The rows' keys.
	 * @returns `true` when every key named a row the table holds. Every key is checked before any
	 *   row turns.
	 */
	toggle(keys: readonly TableKey[]): boolean
}

/**
 * The rows somebody has opened up.
 *
 * @remarks
 * Expansion holds keys exactly as selection does, and what an opened row shows beside it is the
 * host's to draw.
 *
 * @example
 * ```ts
 * table.expansion.toggle('7')
 * table.expansion.keys.has('7') // true
 * ```
 */
export interface ExpansionManagerInterface {
	/** The keys of the rows opened right now. */
	readonly keys: ReadonlySet<TableKey>
	/** Open every row the table holds. */
	expand(): void
	/**
	 * Open one row.
	 *
	 * @param key - The row's key.
	 * @returns `true` when the key named a row the table holds.
	 */
	expand(key: TableKey): boolean
	/**
	 * Open several rows.
	 *
	 * @param keys - The rows' keys.
	 * @returns `true` when every key named a row the table holds. Every key is checked before any
	 *   row opens.
	 */
	expand(keys: readonly TableKey[]): boolean
	/** Close every row. */
	clear(): void
	/**
	 * Close one row.
	 *
	 * @param key - The row's key.
	 * @returns `true` when the key named a row the table holds, whether or not it was open.
	 */
	clear(key: TableKey): boolean
	/**
	 * Close several rows.
	 *
	 * @param keys - The rows' keys.
	 * @returns `true` when every key named a row the table holds. Every key is checked before any
	 *   row closes.
	 */
	clear(keys: readonly TableKey[]): boolean
	/**
	 * Open one row, or close it when it is already open.
	 *
	 * @param key - The row's key.
	 * @returns `true` when the key named a row the table holds.
	 */
	toggle(key: TableKey): boolean
	/**
	 * Turn several rows around, each on its own.
	 *
	 * @param keys - The rows' keys.
	 * @returns `true` when every key named a row the table holds. Every key is checked before any
	 *   row turns.
	 */
	toggle(keys: readonly TableKey[]): boolean
}

/**
 * Which stretch of the filtered rows the view shows.
 *
 * @remarks
 * `page` is the state, counted from one. `offset` and `count` are worked out from it and from the
 * rows the filter admits, so nothing here can drift out of step with what the table holds. A page
 * beyond the last one clamps to the last one.
 *
 * `offset` counts the rows skipped, from zero, which is what a database query asks for.
 *
 * @example
 * ```ts
 * table.pagination.resize(10)
 * table.pagination.move(3)
 * table.pagination.offset // 20
 * ```
 */
export interface PaginationManagerInterface {
	/** The page the view shows, counted from one, and `1` when the table is not paged. */
	readonly page: number
	/** How many rows a page holds, or `undefined` when the table is not paged. */
	readonly limit: number | undefined
	/** How many rows the view skips before the page it shows, counted from zero. */
	readonly offset: number
	/** How many pages the rows admitted by the filter fill, and `1` when the table is not paged. */
	readonly count: number
	/**
	 * Show another page.
	 *
	 * @param page - The page to show, counted from one and clamped to the pages that exist.
	 */
	move(page: number): void
	/**
	 * Say how many rows a page holds.
	 *
	 * @remarks
	 * The view keeps showing the first of the rows it was showing, so the page moves to wherever
	 * that row now falls.
	 *
	 * @param limit - How many rows a page holds. Leave it out to stop paging, and the view shows
	 *   every row the filter admits.
	 */
	resize(limit?: number): void
}

/**
 * A table: what it declares, the rows it holds, and the lens it reads them through.
 *
 * @remarks
 * The table owns values, not pixels. It renders nothing, reads no document, and names no host
 * type, so one table serves a browser, a terminal, a report, and an export equally.
 *
 * Six managers hold everything that moves, one per axis: `rows`, `sort`, `filter`, `selection`,
 * `expansion`, and `pagination`. Nothing else is stored. `view` and `count` are worked out when
 * they are read, so no second copy of the answer can go stale.
 *
 * A write validates all of itself before any of it lands, and announces itself once it has.
 *
 * @example
 * ```ts
 * table.filter.set({ column: 'name', operator: 'contains', text: 'ad' })
 * table.sort.set({ column: 'age', direction: 'descending' })
 * table.view // the rows to draw now: filtered, sorted, paged
 * ```
 */
export interface TableInterface {
	/** The table's event emitter. */
	readonly emitter: EmitterInterface<TableEventMap>
	/** What this table declares. */
	readonly schema: TableSchema
	/** The rows the table holds. */
	readonly rows: RowManagerInterface
	/** The order the table reads them in. */
	readonly sort: SortManagerInterface
	/** Which of them the table keeps. */
	readonly filter: FilterManagerInterface
	/** The ones somebody has picked. */
	readonly selection: SelectionManagerInterface
	/** The ones somebody has opened up. */
	readonly expansion: ExpansionManagerInterface
	/** Which stretch of them the view shows. */
	readonly pagination: PaginationManagerInterface
	/**
	 * The rows to draw right now: filtered, then sorted, then paged.
	 *
	 * @remarks
	 * It is worked out on every read and never stored, so it is right the instant anything moves.
	 */
	readonly view: readonly TableRow[]
	/** How many rows the filter admits, before the page narrows them. */
	readonly count: number
	/** Whether the table has been torn down. */
	readonly destroyed: boolean
	/**
	 * Put the table back the way it opened, holding nothing.
	 *
	 * @remarks
	 * Every row goes, and sort, filter, selection, expansion, and the page all reset. The table
	 * emits `clear` and nothing else, so a reset of ten thousand rows is one announcement.
	 */
	clear(): void
	/**
	 * Tear the table down.
	 *
	 * @remarks
	 * Calling it twice does what calling it once did. Afterwards every write throws a
	 * {@link TableError} coded `DESTROYED`, while every getter still answers what the table last
	 * held, so a host can read its way out of teardown without catching anything.
	 */
	destroy(): void
}
