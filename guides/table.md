# Table

> The environment-agnostic tabular document: a `GridSchema` declaring the columns, a `Grid`
> holding the rows given against it, and one lens of sort, filter, and page deciding which of them
> the view shows.

The core renders nothing and names no host type. **A table, a report,
a terminal listing, and a CSV export are the same abstraction.** They all hold a set of records,
order them, narrow them, and show a stretch of them. What differs is who draws the result, and
drawing belongs to each host. The browser face binds native table elements to that same document.

The row store is the source of truth, and it is the whole of it. Sort terms, filters, the picked
keys, the opened keys, and the page are held; `view` and every tally are worked out on read, so no
second copy of an answer can go stale. A write validates all of itself before any of it lands, and
announces itself after it has.

The core refuses rather than throws. Every guard returns `false` off-shape rather than throwing,
every parser returns `undefined` on refusal, and every row the grid hands back is a frozen owned
copy. Grid-owned refusals raise `GridError`, and each one names a caller mistake.

## Surface

The core and browser error guards recognize self-branded errors across package copies and
subclasses. They validate declared members and refuse transparent proxies and unbranded look-alikes.

The core surface is exported from `@orkestrel/table` ([`src/core`](../src/core)); the native binding
surface comes from `@orkestrel/table/browser` ([`src/browser`](../src/browser)). The manager
classes and the key-set shell they compose are the module's internal declarations: they stay out
of the barrel, so no consumer can construct one, and each constructor takes the grid's emitter
and closures over state `Grid` keeps private, which is why they are internal rather than
published. Every other declaration is reachable from the barrel, so a consumer holds the
mechanisms the package uses on itself.

### Open a grid

Open a grid, narrow it, order it, and read the rows to draw:

```ts
import { createGrid } from '@orkestrel/table'

const grid = createGrid(
	{
		label: 'People',
		key: 'id',
		columns: [
			{ cell: 'text', key: 'id', label: 'Reference' },
			{ cell: 'text', key: 'name', label: 'Name' },
			{ cell: 'number', key: 'age', label: 'Age' },
		],
	},
	{
		rows: [
			{ id: '1', name: 'Ada', age: 36 },
			{ id: '2', name: 'Grace', age: 45 },
			{ id: '3', name: 'Alan', age: 41 },
		],
		limit: 2,
	},
)

grid.filter.set({ column: 'name', operator: 'contains', text: 'a' })
grid.sort.set({ column: 'age', direction: 'descending' })

grid.count // 3 — every name holds a lowercase 'a'
grid.pagination.count // 2 — two pages of two
grid.view.map((row) => row.name) // ['Grace', 'Alan'] — page one, oldest first
```

### Native binding

These declarations belong to the browser entry.

| Name                    | Kind      | Signature                                                                                                                                                                                                                    | Summary                                                                                     |
| ----------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `TableBinding`          | class     | `new (element: HTMLTableElement, document: GridInterface, options?: TableBindingOptions) => TableBindingInterface`                                                                                                           | Retains keyed native rows while projecting every core grid manager.                         |
| `TableBindingInterface` | interface | `{ element, document, destroyed, emitter, refresh(), destroy() }`                                                                                                                                                            | Binds native table elements to a borrowed core document.                                    |
| `TableBindingOptions`   | interface | `{ row?, detail?, scope?, describe?, on?, error? }`                                                                                                                                                                          | Configures row ownership, detail presentation, scoped controls, and event listeners.        |
| `GridRange`             | interface | `{ first, last, count, page, pages, limit }`                                                                                                                                                                                 | Describes the displayed page within the filtered rows.                                      |
| `GridSortDescription`   | interface | `{ column, direction, priority, count }`                                                                                                                                                                                     | Describes a column's direction and one-based priority among active sort orders.             |
| `GridExpansion`         | interface | `{ key, expanded }`                                                                                                                                                                                                          | Proposes one row's next expansion state in a cancelable expand request.                     |
| `TableBindingEventMap`  | type      | `{ readonly sort: readonly [event: CustomEvent<readonly GridOrder[]>]; readonly expand: readonly [event: CustomEvent<readonly GridExpansion[]>]; readonly render: readonly []; readonly error: readonly [error: unknown]; }` | Announces cancelable sorting and expanding, completed rendering, and failed DOM operations. |
| `GridRenderHandler`     | type      | `(element: HTMLTableRowElement, row: GridRow) => void`                                                                                                                                                                       | Patches the contents of a retained row without moving or replacing that row.                |
| `GridProjection`        | interface | `{ schema, rows }`                                                                                                                                                                                                           | Holds a validated native table projection for constructing a core document.                 |
| `TableBindingErrorCode` | type      | `'STRUCTURE'`                                                                                                                                                                                                                | Names a native binding failure at its structure, rendering, or lifecycle boundary.          |
| `TableBindingError`     | class     | `new (code: TableBindingErrorCode, message: string) => TableBindingError`                                                                                                                                                    | Represents a native table binding failure with a machine-readable code.                     |
| `isTableBindingError`   | function  | `(value: unknown) => value is TableBindingError`                                                                                                                                                                             | Checks whether a caught value is a native table binding error.                              |
| `createTableBinding`    | function  | `(element: HTMLTableElement, document: GridInterface, options?: TableBindingOptions) => TableBindingInterface`                                                                                                               | Creates a native table binding with one retained row owner.                                 |
| `readTable`             | function  | `(element: HTMLTableElement) => GridProjection`                                                                                                                                                                              | Reads declared header metadata and explicit row keys into a validated core projection.      |
| `readTableSchema`       | function  | `(element: HTMLTableElement) => GridSchema`                                                                                                                                                                                  | Reads and validates explicit native header metadata.                                        |
| `readTableRows`         | function  | `(schema: GridSchema, elements: readonly HTMLTableRowElement[]) => readonly GridRow[]`                                                                                                                                       | Reads explicit keys and declared direct cells against a core schema.                        |

### Enhance authored rows

Declare one body, a table identity-column name, explicit header column keys and cell kinds, and a
stable key on every data row. Direct cells declare their columns; omitted cells stay absent. Text
is preserved verbatim. Numbers and flags use the core parser. A native data element's value or a
time element's datetime takes precedence over cell text. Choice headers carry their explicit
choice array as JSON in data-table-choices. Nested tables supply no headers or controls to their parent.

This browser example constructs the document before binding it.

```ts
import { createGrid } from '@orkestrel/table'
import { createTableBinding, readTable } from '@orkestrel/table/browser'

const element = document.createElement('table')
element.setAttribute('data-table-key', 'id')
element.innerHTML =
	'<caption>People</caption><thead><tr><th data-table-column="id" data-table-cell="text">Reference</th><th data-table-column="name" data-table-cell="text"><button data-table-sort="name">Name</button></th></tr></thead><tbody><tr data-table-key="ash"><td data-table-column="name">Ash</td></tr><tr data-table-key="cedar"><td data-table-column="name">Cedar</td></tr></tbody>'
document.body.append(element)
const projection = readTable(element)
const grid = createGrid(projection.schema, { rows: projection.rows })
const binding = createTableBinding(element, grid)
grid.filter.set({ column: 'name', operator: 'contains', text: 'Ash' })
binding.refresh()
element.tBodies[0]?.rows.length // 1
binding.destroy()
element.tBodies[0]?.rows.length // 2: restored in core store order
grid.destroyed // false
element.remove()
```

The binding validates the entire authored read before changing core rows. External inserts,
removals, and cell edits reach the document; an invalid read emits error and writes nothing.
Detached rows remain observed while their keys live. Authored mode owns cell values in the DOM;
use the core managers for the view, and edit authored cells to change values. Model mode owns
values in the document and requires an empty body and a row callback. That callback receives
the retained row first and its value second. It only patches contents, and runs on creation or
value change. Sort, selection, filtering, expansion, and pagination do not rerun it.

A detail callback receives a generated row containing one spanning cell. Patch that cell's
contents; the binding owns its placement and identity. Collapsed and off-view details are retained
until their data key leaves the store. Render callbacks must return synchronously. A throw emits
error without render success; refresh retries. Arbitrary callback effects are not rolled back.

Native hooks use real controls: a header button with data-table-sort naming the column, a row
checkbox with data-table-select, a row button with data-table-expand, and a scope checkbox with
data-table-page. Scope defaults to the table. Use a scope dedicated to that table for an external
controls. It selects or clears only current view keys; off-page selection stays selected.
Sort clicks cycle ascending, descending, and absent, replacing the primary order. Programmatic
multi-sort remains intact and is described on each sorted header button. The sort event carries
a cancelable CustomEvent whose detail is the proposed order array; preventDefault vetoes before
the document changes. A row expand button or the page expand button emits expand first, with a
cancelable CustomEvent whose detail lists each key and its proposed expanded state; preventDefault
leaves every key and row unchanged, so a host can run its own close transition and then clear the
key through the document's expansion. The core managers remain the only owners of filters and paging.

An external pager belongs inside the binding's dedicated scope. Use a select with
`data-table-limit`, buttons with `data-table-move="previous"` and `data-table-move="next"`, and an
authored `output` with `data-table-range`. A limit option's value is a positive integer; an empty
value removes paging. Invalid values emit a binding error without changing pagination. Programmatic
limit changes update the select; include an option for each limit your page uses. Native disabled
states follow the bounds. A focused button that becomes disabled hands focus to the enabled
opposite button, or to the named table when neither direction is available.

The range output is cleared before filling on a later task. It fills initially and when the
displayed range, filtered count, page, page count, or limit changes. Sorting, selection, expansion,
and refresh alone don't repeat the sentence. Its implicit status role needs no added live role.
The default is `1 to 2 of 3`, or `0 to 0 of 0` for an empty view. The `describe.range` callback
receives one-based bounds, filtered count, page and page count, and the optional page limit.
The `describe.sort` callback receives the column, direction, one-based priority, and active order
count. Its default is `Sort priority 2 of 2, descending`. Formatter throws emit error without
render success; refresh retries. Destroy cancels pending fills and restores control values still
carrying the binding's last write, preserving caller edits.

A button with `data-table-expand="page"` expands the visible keys, or collapses them when every
visible key is expanded. Off-page expansion stays intact. The cancelable `expand` request lists
only the keys whose state changes. The label stays authored;
`aria-expanded` carries the state, and an empty view disables the button. Row controls continue
to use bare `data-table-expand`. Detail rows and their identifiers survive collapse and paging.
Nested tables supply none of these controls to the containing binding. The binding renders no
numbered page window; presentation classes belong to the host.

This scoped binding example customizes wording while retaining native control labels.

```ts
import { createGrid } from '@orkestrel/table'
import { createTableBinding, readTable } from '@orkestrel/table/browser'

const scope = document.createElement('section')
scope.innerHTML =
	'<table data-table-key="id"><caption>Accounts</caption><thead><tr><th data-table-column="id" data-table-cell="text"><button data-table-sort="id">Account</button></th></tr></thead><tbody><tr data-table-key="ash"><td data-table-column="id">ash</td></tr><tr data-table-key="cedar"><td data-table-column="id">cedar</td></tr></tbody></table><nav aria-label="Account pages"><output data-table-range></output><select aria-label="Rows per page" data-table-limit><option value="1">1</option><option value="">All</option></select><button type="button" data-table-move="previous">Previous</button><button type="button" data-table-move="next">Next</button><button type="button" data-table-expand="page">Page details</button></nav>'
document.body.append(scope)
const element = scope.querySelector('table')
if (element === null) throw new Error('Missing account table')
const projection = readTable(element)
const grid = createGrid(projection.schema, { rows: projection.rows, limit: 1 })
const binding = createTableBinding(element, grid, {
	scope,
	describe: {
		range: ({ first, last, count }) => `${first}–${last} of ${count} accounts`,
		sort: ({ priority, count, direction }) => `Order ${priority}/${count}: ${direction}`,
	},
	detail: (node, row) => {
		const cell = node.cells[0]
		if (cell !== undefined) cell.textContent = `Account ${row['id']}`
	},
})
// Keep the binding while the page is mounted; release it before removing the scope.
binding.destroy()
grid.destroy()
scope.remove()
```

Rendering coalesces on a later task, including writes during callbacks. Rows and child controls
retain identity across the view. Reorders use native state-preserving movement when available;
focus is restored on fallback moves. When a focused row leaves the view, focus moves to the named
table. An already focused external control keeps focus. Destroy disconnects scheduling, observers,
and listeners, restores attributes still carrying the binding's values, removes details, and
returns retained authored rows in core order while retaining a connected focused control. A caller's
deliberate focus choice outside the row remains untouched. Model rows remain an inert final snapshot. The
borrowed document stays live.

The lower-level readers share the same validation boundary, and the row comparison ignores
snapshot identity.

```ts
import {
	TableBinding,
	TableBindingError,
	isTableBindingError,
	readTableRows,
	readTableSchema,
} from '@orkestrel/table/browser'
import { createGrid, matchesGridRow } from '@orkestrel/table'

const element = document.createElement('table')
element.setAttribute('data-table-key', 'id')
element.innerHTML =
	'<thead><tr><th data-table-column="id" data-table-cell="text">Reference</th></tr></thead><tbody></tbody>'
const schema = readTableSchema(element)
const rows = readTableRows(schema, []) // []
const grid = createGrid(schema, { rows })
const binding = new TableBinding(element, grid)
binding.destroy()
matchesGridRow({ id: 'ash' }, { id: 'ash' }) // true
isTableBindingError(new TableBindingError('STRUCTURE', 'Missing identity')) // true
```

### Replace complete rows

Replacement removes omitted optional cells while preserving the identity and its manager state.

```ts
import { createGrid } from '@orkestrel/table'

const grid = createGrid(
	{
		key: 'id',
		columns: [
			{ key: 'id', cell: 'text' },
			{ key: 'name', cell: 'text' },
		],
	},
	{ rows: [{ id: 'ash', name: 'Ash' }] },
)
grid.selection.select('ash')
grid.rows.replace({ id: 'ash' }) // true
grid.rows.row('ash') // { id: 'ash' }
grid.selection.keys.has('ash') // true
```

### Row equality

This helper belongs to the core entry.

| Name             | Kind     | Signature                                                 | Summary                                                                  |
| ---------------- | -------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `matchesGridRow` | function | `(left: GridRow \| undefined, right: GridRow) => boolean` | Compares complete row values independently of their snapshot identities. |

### Rows, cells, and columns

The document itself — what a grid declares and what one row of it holds. All data, no behavior.

| Name           | Kind      | Signature                                                  | Summary                                                                                                                                                                                     |
| -------------- | --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GridKey`      | type      | `string`                                                   | Represents a row's identity — a `string`, carried in the cell the schema's `key` names.                                                                                                     |
| `GridCell`     | type      | `string \| number \| boolean`                              | Represents every value a cell can hold — a `string`, a `number`, or a `boolean`.                                                                                                            |
| `GridRow`      | type      | `Readonly<Record<string, GridCell>>`                       | Represents one row, keyed by column. A column nobody has filled has no key here.                                                                                                            |
| `ColumnCell`   | type      | `'text' \| 'number' \| 'flag' \| 'choice'`                 | Names what a column's cells hold — the discriminant that fixes the column's options, its comparison, and the filters that apply to it.                                                      |
| `ColumnChoice` | interface | `{ value, label, help? }`                                  | Represents one value a `choice` column offers — `value` is stored, `label` is read, and `help` explains.                                                                                    |
| `ColumnBase`   | interface | `{ key, label?, help?, hidden?, meta? }`                   | Describes what every column carries, whatever its cells hold — the name a row's cell uses, the text a reader sees, whether a host draws the column, and the metadata a host attaches to it. |
| `TextColumn`   | interface | `{ cell }`                                                 | Represents a column of text, compared lexically. Carries a date, a time, and a timestamp as ISO strings.                                                                                    |
| `NumberColumn` | interface | `{ cell }`                                                 | Represents a column of numbers, compared by magnitude.                                                                                                                                      |
| `FlagColumn`   | interface | `{ cell }`                                                 | Represents a column of yes-or-no answers, compared false before true.                                                                                                                       |
| `ChoiceColumn` | interface | `{ cell, choices }`                                        | Represents a column drawn from a declared list, compared by the order that list declares. It requires `choices`.                                                                            |
| `GridColumn`   | type      | `TextColumn \| NumberColumn \| FlagColumn \| ChoiceColumn` | Represents any column a schema can declare — the union discriminated on `cell`.                                                                                                             |
| `GridSchema`   | interface | `{ name?, label?, help?, key, columns }`                   | Holds everything a grid declares about itself — how the grid is described, which column carries row identity, and the columns it declares, in the order it declares them.                   |

### The lens

The axes a grid reads its rows through, and the slots that replace what a column's cell fixes.

| Name             | Kind      | Signature                                                               | Summary                                                                                                                                        |
| ---------------- | --------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GridTerm`       | interface | `{ column }`                                                            | Represents one entry of a lens list — the `column` it names. A sort term and a filter each hold one, which is why the two share a list engine. |
| `GridDirection`  | type      | `'ascending' \| 'descending'`                                           | Names which way a column sorts. A column nobody has sorted carries no term at all.                                                             |
| `GridOrder`      | interface | `{ column, direction }`                                                 | Represents one column's place in the sort — the `column` and its `direction`. The list is read left to right.                                  |
| `FilterOperator` | type      | `'contains' \| 'between' \| 'equals'`                                   | Names how a filter tests a cell — the operator each filter carries.                                                                            |
| `ContainsFilter` | interface | `{ column, operator, text }`                                            | Keeps the rows whose cell holds this `text` somewhere inside it.                                                                               |
| `BetweenFilter`  | interface | `{ column, operator, minimum, maximum }`                                | Keeps the rows whose cell falls between `minimum` and `maximum`, both included, compared the way the column compares.                          |
| `EqualsFilter`   | interface | `{ column, operator, value }`                                           | Keeps the rows whose cell holds exactly this `value`.                                                                                          |
| `GridFilter`     | type      | `ContainsFilter \| BetweenFilter \| EqualsFilter`                       | Represents any filter a grid can hold — the union discriminated on `operator`.                                                                 |
| `CellComparator` | type      | `(left: GridCell \| undefined, right: GridCell \| undefined) => number` | Compares two cells of one column, replacing what its `cell` fixes. Always describes ascending order; direction is applied afterwards.          |
| `CellMatcher`    | type      | `(cell: GridCell \| undefined, filter: GridFilter) => boolean`          | Tests one column's cell against a filter, replacing what its `cell` fixes. Receives every filter the grid holds against that column.           |

### The grid

The entity, its managers, its factory, its contract, and the error it raises.

| Name                         | Kind      | Signature                                                                                                                                                                                                                                                                                                                                                                                             | Summary                                                                                                                                                                                          |
| ---------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Grid`                       | class     | `new (schema: GridSchema, options?: GridOptions) => GridInterface`                                                                                                                                                                                                                                                                                                                                    | Holds a schema, its rows, and the lens through which they are read, implementing `GridInterface` exactly.                                                                                        |
| `GridInterface`              | interface | `{ emitter, schema, rows, sort, filter, selection, expansion, pagination, view, count, destroyed, clear(), destroy() }`                                                                                                                                                                                                                                                                               | Represents a grid: what it declares, the rows it holds, and the lens it reads them through.                                                                                                      |
| `createGrid`                 | function  | `(schema: GridSchema, options?: GridOptions) => GridInterface`                                                                                                                                                                                                                                                                                                                                        | Opens a grid against a schema. The schema is copied, and the copy is what the grid declares.                                                                                                     |
| `GridOptions`                | interface | `{ on?, error?, rows?, comparators?, matchers?, limit? }`                                                                                                                                                                                                                                                                                                                                             | Describes how to open a grid — the listeners wired at construction and where a throw from one goes, the rows seeded into it, the per-column comparison and test replacements, and the page size. |
| `GridEventMap`               | type      | `{ readonly write: readonly [key: GridKey]; readonly remove: readonly [key: GridKey]; readonly sort: readonly [orders: readonly GridOrder[]]; readonly filter: readonly [filters: readonly GridFilter[]]; readonly select: readonly [keys: ReadonlySet<GridKey>]; readonly expand: readonly [keys: ReadonlySet<GridKey>]; readonly paginate: readonly [page: number]; readonly clear: readonly []; }` | Lists everything a grid announces, mapping each event to the payload its listeners receive.                                                                                                      |
| `RowManagerInterface`        | interface | `{ row(), rows(), add(), update(), replace(), move(), remove() }`                                                                                                                                                                                                                                                                                                                                     | Manages the rows a grid holds, in the order it holds them.                                                                                                                                       |
| `SortManagerInterface`       | interface | `{ order(), orders(), set(), remove() }`                                                                                                                                                                                                                                                                                                                                                              | Manages the order a grid reads its rows in.                                                                                                                                                      |
| `FilterManagerInterface`     | interface | `{ filter(), filters(), set(), remove() }`                                                                                                                                                                                                                                                                                                                                                            | Manages which rows a grid keeps.                                                                                                                                                                 |
| `SelectionManagerInterface`  | interface | `{ keys, select(), clear(), toggle() }`                                                                                                                                                                                                                                                                                                                                                               | Manages the rows somebody has picked.                                                                                                                                                            |
| `ExpansionManagerInterface`  | interface | `{ keys, expand(), clear(), toggle() }`                                                                                                                                                                                                                                                                                                                                                               | Manages the rows somebody has opened up.                                                                                                                                                         |
| `PaginationManagerInterface` | interface | `{ page, limit, offset, count, move(), resize() }`                                                                                                                                                                                                                                                                                                                                                    | Manages which stretch of the filtered rows the view shows.                                                                                                                                       |
| `GridError`                  | class     | `new (code: GridErrorCode, message: string, context?: JSONRecord) => GridError`                                                                                                                                                                                                                                                                                                                       | Represents an error raised by the grid domain — a machine-readable `code` and optional structured `context`.                                                                                     |
| `GridErrorCode`              | type      | `'SCHEMA' \| 'COLUMN' \| 'KEY' \| 'CELL' \| 'DESTROYED'`                                                                                                                                                                                                                                                                                                                                              | Names the reason a `GridError` carries — the machine-readable code a `catch` branches on.                                                                                                        |
| `isGridError`                | function  | `(input: unknown) => input is GridError`                                                                                                                                                                                                                                                                                                                                                              | Determines whether a caught value is a grid error, so a `catch` branches on `code` without an assertion.                                                                                         |

`GridInterface`'s readonly data members stay here, in its `Signature` cell, rather than in
`## Methods`, and each manager's own readonly members sit in that manager's cell. Every
call-signature member is documented under [Methods](#methods).

The members spelled `count` answer different questions, because each is the lone tally of the
entity it belongs to. `grid.count` is **rows** — how many the filter admits, before the page narrows them.
`grid.pagination.count` is **pages** — how many the admitted rows fill.

Each manager class is constructed by `Grid` and stays out of the barrel, so no consumer can
construct one. Its constructor takes the grid's emitter and a set of closures over state the
owning grid keeps private, which is what keeps every store single-owned, so the class is internal
and its interface is the published contract. A consumer writing its own grid composes `Grid`, or writes
its own managers against the manager interfaces and reads these classes as the working reference.

### Constants

The cell registry and the column budget. The registry is frozen, so a shared list cannot be
rewritten under a consumer. The other schema budgets are `@orkestrel/contract` exports; § Budgets
lists them.

| Name           | Kind  | Signature               | Summary                                                                |
| -------------- | ----- | ----------------------- | ---------------------------------------------------------------------- |
| `COLUMN_CELLS` | const | `readonly ColumnCell[]` | Lists every column cell, in the order declared by the public contract. |
| `COLUMN_LIMIT` | const | `256`                   | Names the maximum number of columns one schema may declare: 256.       |

### Guards

Total `is*` guards over unknown input. None throws, none coerces, and each returns `false` for
anything off-shape — including an unexpected prototype, a symbol key, or a cyclic value.

| Name                     | Kind     | Signature                                   | Summary                                                                                                                                |
| ------------------------ | -------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `isGridCell`             | function | `(input: unknown) => input is GridCell`     | Determines whether an unknown value has a grid cell shape — a string, a finite number, or a boolean.                                   |
| `isGridRow`              | function | `(input: unknown) => input is GridRow`      | Determines whether an unknown value is a record whose every own key is a string and every value a `GridCell`.                          |
| `isColumnCell`           | function | `(input: unknown) => input is ColumnCell`   | Determines whether an unknown value is a declared column cell.                                                                         |
| `isColumnChoice`         | function | `(input: unknown) => input is ColumnChoice` | Determines whether an unknown value is one exact `ColumnChoice` record; an unknown member refuses it.                                  |
| `isGridColumn`           | function | `(input: unknown) => input is GridColumn`   | Determines whether an unknown value is one exact discriminated `GridColumn`, checked against its cell's own options.                   |
| `isStructuralGridSchema` | function | `(input: unknown) => input is GridSchema`   | Determines whether an unknown value has the exact shape of a `GridSchema` — the shape alone, with no domain check.                     |
| `isGridSchema`           | function | `(input: unknown) => input is GridSchema`   | Determines whether an unknown value is a `GridSchema` a grid can be opened against — the exact shape, and an audit that finds nothing. |

The schema guards answer about a schema, and which one to reach for is which question you are asking.
`isStructuralGridSchema` asks whether the shape is exact: every declared member present and typed,
and nothing else there. `isGridSchema` asks that and then asks `auditGrid`, so it refuses a
schema-shaped value carrying a domain fault or a budget breach — a `key` naming no declared column,
a column key declared twice, a `choice` column offering nothing. It is the guard the parsers read.
The `Grid` constructor asks in a different order. It guards the value it was handed, owns a copy
of it, then guards and audits that copy and keeps that same object. Its `SCHEMA` message carries
the audit diagnostics when the owned copy reaches the audit, and names
`The schema is not a grid schema` when the copy fails the guard the handed value passed. It also
names `column "<key>" has metadata that cannot be owned` when the column's `meta` answers the
guard's read and the clone's read differently, the message `cloneGridSchema` raises and the
constructor rethrows unchanged.

`isGridSchema`, the constructor, and `parseGrid` agree on every schema whose reads are stable,
which is every schema made of ordinary declared data. They part where a foreign object answers a
property read with something other than the value a clone of it holds — a `meta` behind a `get`
trap is the shipped case. `isGridSchema` admits such a schema, because it reads it once and the
read answers. The constructor refuses it, because it guards the copy it owns rather than the object
it read, and `parseGrid` refuses it too, because it re-guards its own projection. Reach for the
structural guard where you mean to run the audit yourself and read its diagnostics.

### Helpers

The pure leaves the grid composes: the column lookup, the identity read, the key-set engine, the
lens-list operations, the cell gate, the comparison, the filter tests, the row passes, the
audit, and the wire projections. `computeKeys`, `matchesTerms`, `filterGridRows`, and `sortGridRows`
propagate exceptions from supplied callbacks; `serializeGrid` raises `SCHEMA` for a `meta` no clone
can own. The other helpers are total over ordinary declared inputs, subject to the core's
reflection-failure boundary described later.

| Name             | Kind     | Signature                                                                                                                                                                                     | Summary                                                                                                                     |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `extractColumn`  | function | `(schema: GridSchema, key: string) => GridColumn \| undefined`                                                                                                                                | Finds one column by key; `undefined` when the schema declares no such column.                                               |
| `extractGridKey` | function | `(schema: GridSchema, row: GridRow) => GridKey \| undefined`                                                                                                                                  | Reads one row's declared identity; `undefined` when its key cell is missing, empty, or not a string.                        |
| `computeKeys`    | function | `(known: readonly GridKey[], current: ReadonlySet<GridKey>, input: GridKey \| readonly GridKey[] \| undefined, include: (included: boolean) => boolean) => ReadonlySet<GridKey> \| undefined` | Computes one atomic 0/1/N membership change over the keys a caller may address — the engine selection and expansion share.  |
| `mergeTerms`     | function | `<Term extends GridTerm>(current: readonly Term[], requested: readonly Term[]) => readonly Term[]`                                                                                            | Merges lens terms into a column-keyed list, replacing the entry that names the same column — the `set` write.               |
| `removeTerms`    | function | `<Term extends GridTerm>(current: readonly Term[], columns: readonly string[]) => readonly Term[]`                                                                                            | Removes every lens term naming one of the given columns — the drop `sort.remove` and `filter.remove` share.                 |
| `matchesTerms`   | function | `<Term extends GridTerm>(left: readonly Term[], right: readonly Term[], equal: (left: Term, right: Term) => boolean) => boolean`                                                              | Checks whether two lens lists hold the same terms in the same order, with the supplied test deciding the operands.          |
| `matchesCell`    | function | `(column: GridColumn, value: unknown) => value is GridCell`                                                                                                                                   | Checks whether one column can hold a value — the shape gate every write and every seed passes through.                      |
| `compareCells`   | function | `(column: GridColumn, left: GridCell \| undefined, right: GridCell \| undefined) => number`                                                                                                   | Compares two of one column's cells the way its `cell` fixes, describing ascending order.                                    |
| `admitsFilter`   | function | `(column: GridColumn, filter: GridFilter) => boolean`                                                                                                                                         | Checks whether one column admits a filter and every operand it carries — the gate `filter.set` and `matchesFilter` share.   |
| `matchesFilter`  | function | `(column: GridColumn, cell: GridCell \| undefined, filter: GridFilter) => boolean`                                                                                                            | Tests one of a column's cells against one filter the way its `cell` fixes.                                                  |
| `filterGridRows` | function | `(schema: GridSchema, rows: readonly GridRow[], filters: readonly GridFilter[], matchers?: Readonly<Record<string, CellMatcher>>) => readonly GridRow[]`                                      | Keeps the rows every filter accepts, in the order given; a supplied `CellMatcher` replaces the default per column.          |
| `sortGridRows`   | function | `(schema: GridSchema, rows: readonly GridRow[], orders: readonly GridOrder[], comparators?: Readonly<Record<string, CellComparator>>) => readonly GridRow[]`                                  | Orders rows by the terms given, stably; a supplied `CellComparator` replaces the default per column.                        |
| `auditGrid`      | function | `(schema: GridSchema) => readonly string[]`                                                                                                                                                   | Audits a structurally valid schema for domain faults and budget breaches, returning human diagnostics.                      |
| `serializeGrid`  | function | `(schema: GridSchema) => JSONRecord`                                                                                                                                                          | Projects a schema into JSON in declaration order, dropping every absent member; raises `SCHEMA` for a `meta` it cannot own. |
| `serializeRows`  | function | `(schema: GridSchema, rows: readonly GridRow[]) => readonly JSONRecord[]`                                                                                                                     | Projects rows into JSON with each row's cells in the schema's column order, dropping every absent cell.                     |

### Cloners

Owned frozen snapshots. The grid takes one of the schema at construction and one of every row at
admission, so a later edit to the object a caller passed changes nothing inside the grid, and no
row the grid hands back is a live internal reference.

| Name              | Kind     | Signature                            | Summary                                                                                                                                                         |
| ----------------- | -------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloneRow`        | function | `(row: GridRow) => GridRow`          | Clones one row into an owned frozen snapshot.                                                                                                                   |
| `cloneGridSchema` | function | `(schema: GridSchema) => GridSchema` | Clones a whole schema into an owned frozen snapshot, freezing every nested column, choice list, choice, and `meta`; raises `SCHEMA` for a `meta` it cannot own. |

`cloneRow` cannot fail for an ordinary row record, subject to the core's reflection-failure boundary
described later. `cloneGridSchema` can also fail when a column's `meta` holds something no clone can own, such as a
record that refers back to itself. `meta` is typed as JSON and a cycle satisfies that type, so the
refusal is a `GridError` coded `SCHEMA` rather than a silent partial copy. `createGrid` never reaches
it for a schema whose reads are stable, because `isGridColumn` admits only bounded, exactly ownable
JSON there and refuses such a schema first; a `meta` that answers the guard's read with ownable JSON
and the clone's read with something no clone can own reaches it, and it refuses
with `column "<key>" has metadata that cannot be owned`. This is the door a caller cloning or
serializing a schema on its own meets, and `serializeGrid` refuses the same value the same way.

### Parsers

The wire boundary. Each returns `undefined` on refusal rather than throwing, and each returns an
owned value rather than the caller's.

| Name        | Kind     | Signature                                                                 | Summary                                                                                                               |
| ----------- | -------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `parseGrid` | function | `(input: unknown) => GridSchema \| undefined`                             | Parses unknown wire data into an owned, structurally valid, semantically sound grid schema.                           |
| `parseRows` | function | `(schema: GridSchema, input: unknown) => readonly GridRow[] \| undefined` | Parses unknown wire data into owned rows against one grid schema, coercing a numeric string and `'true'` / `'false'`. |

**Reflection failures.** A TypeScript shape does not guarantee that reflection succeeds. An ordinary
helper or cloner may propagate a throw from a proxy trap or accessor. Guards and parsers contain that
throw and refuse instead. This is the reflection-failure boundary for the whole core.

## Cells

Each cell fixes what the column's cells may hold, how two of them compare, and which filter operators
apply. Choosing the cell is the whole of a column's behavior, which is why there is no `sortable`, no
`filterable`, and no comparison declared beside it.

| Cell     | Holds     | Its own options | Compares by                  | Filters with                    |
| -------- | --------- | --------------- | ---------------------------- | ------------------------------- |
| `text`   | `string`  | —               | Lexical order                | `contains`, `between`, `equals` |
| `number` | `number`  | —               | Magnitude                    | `between`, `equals`             |
| `flag`   | `boolean` | —               | False before true            | `equals`                        |
| `choice` | `string`  | `choices`       | The order `choices` declares | `contains`, `equals`            |

A cell nobody has filled has no key in its row. Absence is `undefined` and never `null`, never an
empty string, and never a zero. An absent cell sorts before every present one in ascending order,
and every filter refuses it — a row with no cell in a filtered column is not a row that column
accepts.

### text

This fence declares a `text` column.

```ts
import type { TextColumn } from '@orkestrel/table'

const name: TextColumn = { cell: 'text', key: 'name', label: 'Name' }
```

`contains` is the operator a filter bar reaches for, and it compares **case-sensitively**. Case
folding is a locale decision this package cannot make for a host, so a grid that wants it supplies
a `CellMatcher` for that column. The same is true of collation: `text` compares with the language's
own string order, not a locale-aware collator.

### number

This fence declares a `number` column.

```ts
import type { NumberColumn } from '@orkestrel/table'

const age: NumberColumn = { cell: 'number', key: 'age', label: 'Age' }
```

A cell must be a finite number. `NaN` and either infinity are values a column cannot hold, so a
write carrying one raises `GridError` coded `CELL`.

### flag

This fence declares a `flag` column.

```ts
import type { FlagColumn } from '@orkestrel/table'

const active: FlagColumn = { cell: 'flag', key: 'active', label: 'Active' }
```

`flag` takes `equals` and nothing else. `contains` has no meaning against a boolean and `between`
carries bounds it could not order usefully, so a filter carrying either against a `flag` column
raises `GridError` coded `CELL`.

### choice

This fence declares a `choice` column with its ordered choices.

```ts
import type { ChoiceColumn } from '@orkestrel/table'

const status: ChoiceColumn = {
	cell: 'choice',
	key: 'status',
	label: 'Status',
	choices: [
		{ value: 'draft', label: 'Draft' },
		{ value: 'live', label: 'Live' },
		{ value: 'archived', label: 'Archived', help: 'Kept, not shown' },
	],
}
```

A `choice` cell holds one of the declared values, and a cell holding a value the list does not offer
is refused at admission. The order the list declares is the order the column sorts by, which is what
lets a status column sort draft before live before archived rather than alphabetically — the one
thing a plain `text` column could not do without a comparator per consumer.

```ts
import { compareCells } from '@orkestrel/table'
import type { ChoiceColumn } from '@orkestrel/table'

const status: ChoiceColumn = {
	cell: 'choice',
	key: 'status',
	choices: [
		{ value: 'draft', label: 'Draft' },
		{ value: 'live', label: 'Live' },
	],
}

compareCells(status, 'draft', 'live') < 0 // true — declared order, not alphabetical
compareCells({ cell: 'text', key: 'name' }, 'draft', 'live') < 0 // true — lexical, and here they agree
compareCells({ cell: 'flag', key: 'ok' }, false, true) < 0 // true — false before true
```

### Temporal data is text

There is no temporal cell. A date, a time, and a timestamp are `text` columns holding ISO strings,
because **lexical order is chronological order for one canonical ISO representation** — one offset,
one precision, and one normalized spelling for each instant across the whole column. That is the
whole reason the format exists, and it is what lets a `between` filter over such a column be a date
range with no new operator, no new cell, and no calendar inside this package.

```ts
import { matchesFilter } from '@orkestrel/table'
import type { BetweenFilter, TextColumn } from '@orkestrel/table'

const when: TextColumn = { cell: 'text', key: 'when', label: 'Signed up' }
const range: BetweenFilter = {
	column: 'when',
	operator: 'between',
	minimum: '2026-01-01',
	maximum: '2026-06-30',
}

matchesFilter(when, '2026-03-14', range) // true
matchesFilter(when, '2025-12-31', range) // false
```

That is a boundary drawn on purpose, and it asks these things of the values a column holds. Every
one of them is a comparison on the spelling, because that is the only comparison there is here.

**One offset.** A column mixing offsets is not in chronological order:
`'2026-01-01T00:00:00+01:00'` sorts after `'2025-12-31T23:30:00Z'` and names an instant half an hour
earlier than it. Normalize to UTC `Z` before a value is stored — the usual answer — or supply a
`CellComparator` for that column that reads the offset before it compares.

**One precision.** `'09:00'` sorts before `'09:00:00'`, so a column mixing the two orders them by
spelling rather than by clock. A filter's operands must match their cells the same way.

**Normalized midnight.** ISO permits `24:00:00Z`, but `2026-01-01T24:00:00Z` names the same instant
as `2026-01-02T00:00:00Z` while sorting before it. Normalize midnight to the next day's
`00:00:00Z`, and use that spelling in filter operands too.

**No calendar.** No value is checked against a real date, so `'2026-02-31'` is an ordinary `text`
cell here. A host that renders a date control already refuses an impossible day, and a domain that
needs the check adds it at its own door.

### meta

`ColumnBase.meta` is a bounded JSON carrier for whatever the schema declines to model. The grid
never reads it, no comparison sees it, no filter tests it, and it round-trips verbatim key for key.
This package defines no key in it, so every key belongs to the host: an alignment, a number format,
a pixel width, an icon name.

`hidden` sits beside it and is the one presentation fact the schema does carry, because hiding a
column changes nothing about the data. A hidden column is still sorted, still filtered, and still
serialized; whether it is drawn is the host's read of that flag.

### Reading a column

These reads turn a column key into a decision, and each is exported because a host asking the same
question before it writes needs the same answer. `extractColumn` finds the column a key names, and
`matchesCell` is the gate every write, every seed, and every filter operand passes through.

```ts
import { extractColumn, matchesCell } from '@orkestrel/table'
import type { GridSchema } from '@orkestrel/table'

const schema: GridSchema = {
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'number', key: 'age' },
	],
}

extractColumn(schema, 'age')?.cell // 'number'
extractColumn(schema, 'colour') // undefined — the schema declares no such column

matchesCell({ cell: 'number', key: 'age' }, 36) // true
matchesCell({ cell: 'number', key: 'age' }, '36') // false — a numeric string is not a number
matchesCell({ cell: 'number', key: 'age' }, Number.NaN) // false — a cell must be finite
matchesCell({ cell: 'choice', key: 'status', choices: [{ value: 'live', label: 'Live' }] }, 'draft')
// false — the list does not offer it
```

`extractColumn` returning `undefined` is how every `COLUMN` refusal starts: a term or a filter
naming a column the schema does not declare has nothing to be measured against.

### Overriding a column

`GridOptions.comparators` and `GridOptions.matchers` are keyed by column key, and each entry
replaces — for that column alone — the comparison or the test its `cell` fixes. They are the reason
no function belongs in the schema: behavior is supplied where the grid is opened, and the schema
stays data that crosses a wire whole.

```ts
import { createGrid } from '@orkestrel/table'
import type { CellComparator, CellMatcher } from '@orkestrel/table'

const natural: CellComparator = (left, right) =>
	String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true })

const loose: CellMatcher = (cell, filter) =>
	filter.operator === 'contains' &&
	String(cell ?? '')
		.toLowerCase()
		.includes(filter.text.toLowerCase())

const grid = createGrid(
	{
		key: 'id',
		columns: [
			{ cell: 'text', key: 'id' },
			{ cell: 'text', key: 'name' },
		],
	},
	{
		rows: [{ id: '1', name: 'ada' }],
		comparators: { name: natural },
		matchers: { name: loose },
	},
)

grid.filter.set({ column: 'name', operator: 'contains', text: 'ADA' })
grid.count // 1 — the matcher folded the case; the default would not have
```

An override receives `undefined` for a row carrying no cell there, so it decides absence for itself.
A comparator always describes ascending order and `GridDirection` is applied afterwards, so one
comparator serves either direction. An override for a column the schema does not declare is never
consulted and is not an error: the schema decides which columns exist, and the option only says how
one of them behaves.

## Identity

Every row carries its own identity, in the cell named by `GridSchema.key`, as a non-empty string.

`key` is **required**. It must name a declared column, and the grid refuses a row whose cell there
is missing, empty, or not a string. There is no default column, no positional fallback, and no key
generation: an index is a position, and a position is not an identity — the moment a sort moves a
row, a position that named it names somebody else.

That is a deliberate divergence from `@orkestrel/database`, whose `DEFAULT_PRIMARY` assumes `id`
when a grid declares no primary column. A database row arrives from a store that already gave it a
key, so assuming the usual name saves a declaration and costs nothing. A grid's rows arrive from a
caller who may have joined, projected, or invented them in the browser, so the same assumption picks
a column that may not exist, or picks one that exists and is not unique. Declaring the key is one
line, and it is the line every refusal described later is measured against.

```ts
import { createGrid, isGridError } from '@orkestrel/table'

const grid = createGrid({
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'text', key: 'name' },
	],
})

grid.rows.add({ id: '7', name: 'Ada' })

try {
	grid.rows.add({ id: '7', name: 'Grace' })
} catch (error) {
	if (isGridError(error)) error.code // 'KEY' — already taken
}

try {
	grid.rows.add({ name: 'Alan' })
} catch (error) {
	if (isGridError(error)) error.code // 'KEY' — no identity at all
}

grid.rows.rows().length // 1 — a refused write changed nothing
```

These rules follow from it, and each one is a refusal rather than a repair:

- **A key is unique.** `add` raises `KEY` for a key the grid already holds, and for a key repeated
  inside one batch. Every row in the batch is checked before any is admitted, so one duplicate
  admits none of them.
- **A key cannot move.** `update` merges: the cells given replace the cells held and the cells left
  out stay as they are. A row is found by the key it carries, so writing a different key writes a
  different row — or writes nothing, if that row does not exist.
- **A row is owned.** The grid clones and freezes a row at admission, so the object a caller keeps
  is no longer the row the grid holds, and `row()` and `rows()` hand back frozen copies rather than
  internal references.
- **Selection and expansion hold keys.** Never rows, never positions. A pick survives a sort, a
  filter, and a page turn, and a row that leaves the grid takes its key out of both sets with it.

`update` is where that second rule is felt. It merges, so a call carries only the cells it means to
change, and the row it writes is the one carrying the key it names — never a rename.

```ts
import { createGrid } from '@orkestrel/table'

const grid = createGrid(
	{
		key: 'id',
		columns: [
			{ cell: 'text', key: 'id' },
			{ cell: 'text', key: 'name' },
			{ cell: 'number', key: 'age' },
		],
	},
	{ rows: [{ id: '1', name: 'Ada', age: 36 }] },
)

grid.rows.update({ id: '1', age: 37 }) // true
grid.rows.row('1') // { id: '1', name: 'Ada', age: 37 } — `name` was left out and stayed
grid.rows.update({ id: '9', name: 'Nobody' }) // false — no row carries that key
grid.rows.rows().length // 1 — a different key is a different row, so nothing was added
```

`extractGridKey` is the read those rules are built on, and it is exported because a host doing the same
check before it calls needs the same answer.

```ts
import { extractGridKey } from '@orkestrel/table'
import type { GridSchema } from '@orkestrel/table'

const schema: GridSchema = { key: 'id', columns: [{ cell: 'text', key: 'id' }] }

extractGridKey(schema, { id: '7' }) // '7'
extractGridKey(schema, { id: '' }) // undefined — empty is not an identity
extractGridKey(schema, { name: 'Ada' }) // undefined — no key cell at all
```

## The lens

Sort, filter, and page are one lens over one row store. Reading `view` applies them in a fixed
order — **filter, then sort, then page** — and that order is not configurable, because the other
orders answer a different question: sorting before filtering sorts rows nobody will see, and paging
before sorting pages the wrong rows onto every page.

### Sorting

The grid holds at most one term per column and applies them in the order they were set. The first
term decides, and each later term breaks the tie the terms before it left. Rows no term separates
keep the order the grid holds them in, so the sort is stable and the row store's own order is the
final tiebreak.

```ts
import { createGrid } from '@orkestrel/table'

const grid = createGrid(
	{
		key: 'id',
		columns: [
			{ cell: 'text', key: 'id' },
			{ cell: 'text', key: 'team' },
			{ cell: 'number', key: 'age' },
		],
	},
	{
		rows: [
			{ id: '1', team: 'blue', age: 40 },
			{ id: '2', team: 'red', age: 30 },
			{ id: '3', team: 'blue', age: 30 },
		],
	},
)

grid.sort.set([
	{ column: 'team', direction: 'ascending' },
	{ column: 'age', direction: 'descending' },
])

grid.view.map((row) => row.id) // ['1', '3', '2'] — team first, age breaking the tie
grid.sort.order('age') // { column: 'age', direction: 'descending' }
```

There is no cycling verb. Which direction a heading offers next is the host's decision, so a host
reads the column's term, decides, and then calls `set` or `remove`. Setting a term for a column
already sorted replaces that column's direction **in place**, keeping its position in the list; every
other term joins the end.

Sorting and filtering keep the same list: at most one term per column, replaced in place, and
compared as a whole before anything is announced. `mergeTerms` performs that write, `removeTerms`
the drop, and `matchesTerms` the comparison, which takes the operand test from its caller because a
direction and a filter's operands are not compared the same way. They are exported so that a host
holding a lens of its own gets the same list arithmetic without writing it again.

```ts
import { matchesTerms, mergeTerms, removeTerms } from '@orkestrel/table'
import type { GridOrder } from '@orkestrel/table'

const current: readonly GridOrder[] = [
	{ column: 'team', direction: 'ascending' },
	{ column: 'age', direction: 'descending' },
]
const next = mergeTerms(current, [{ column: 'age', direction: 'ascending' }])

next.map((order) => order.column) // ['team', 'age'] — the replaced term keeps its place
matchesTerms(next, current, (order, other) => order.direction === other.direction) // false
removeTerms(next, ['team']).map((order) => order.column) // ['age']
```

`sortGridRows` is the same pass without a grid, for a caller that has rows and terms and no entity. It
sorts a copy, so the list handed to it never moves.

```ts
import { sortGridRows } from '@orkestrel/table'
import type { GridSchema } from '@orkestrel/table'

const schema: GridSchema = {
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'number', key: 'age' },
	],
}
const rows = [{ id: '1', age: 40 }, { id: '2' }, { id: '3', age: 30 }]

sortGridRows(schema, rows, [{ column: 'age', direction: 'ascending' }]).map((row) => row.id)
// ['2', '3', '1'] — an absent cell sorts before every present one
sortGridRows(schema, rows, []).map((row) => row.id) // ['1', '2', '3'] — no term, no movement
rows.map((row) => row.id) // ['1', '2', '3'] — the input is untouched
```

### Filtering

The grid holds at most one filter per column and keeps every row all of them accept. Composition is
**and** in this version: there is no either-or, and no nesting.

A filter names a column and carries only the operands its operator uses, so a `between` missing a
bound cannot be written down. An operator the column's cell does not admit raises `GridError` coded
`CELL`, and an operand the column cannot hold raises the same — a `contains` against a `number`
column and a `between` whose bounds are the wrong shape are both refusals, not empty results.

```ts
import { createGrid, isGridError } from '@orkestrel/table'

const grid = createGrid(
	{
		key: 'id',
		columns: [
			{ cell: 'text', key: 'id' },
			{ cell: 'text', key: 'name' },
			{ cell: 'number', key: 'age' },
		],
	},
	{
		rows: [
			{ id: '1', name: 'Ada', age: 36 },
			{ id: '2', name: 'Grace', age: 45 },
		],
	},
)

grid.filter.set([
	{ column: 'name', operator: 'contains', text: 'a' },
	{ column: 'age', operator: 'between', minimum: 40, maximum: 50 },
])

grid.count // 1 — both filters, and only Grace satisfies both
grid.view.map((row) => row.name) // ['Grace']

try {
	grid.filter.set({ column: 'age', operator: 'contains', text: '4' })
} catch (error) {
	if (isGridError(error)) error.code // 'CELL' — `contains` has no meaning against a number
}
```

That admissibility rule has one home. `admitsFilter` answers whether a column takes a filter and
every operand it carries, and both doors read it: `filter.set` raises `CELL` when it says no, and
`matchesFilter` returns `false` for the same filter rather than testing it. So a host can ask the
question before it offers the control — which operators to put in a column's menu, and whether the
value somebody typed is one that column can take.

```ts
import { admitsFilter } from '@orkestrel/table'
import type { NumberColumn } from '@orkestrel/table'

const age: NumberColumn = { cell: 'number', key: 'age', label: 'Age' }

admitsFilter(age, { column: 'age', operator: 'between', minimum: 30, maximum: 40 }) // true
admitsFilter(age, { column: 'age', operator: 'contains', text: '3' }) // false — not an operator a number takes
admitsFilter(age, { column: 'age', operator: 'equals', value: '36' }) // false — an operand the column cannot hold
admitsFilter(age, { column: 'name', operator: 'equals', value: 36 }) // false — the filter names another column
```

`filterGridRows` is the same pass without a grid, and it keeps the order it was given.

```ts
import { filterGridRows } from '@orkestrel/table'
import type { GridSchema } from '@orkestrel/table'

const schema: GridSchema = {
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'text', key: 'name' },
	],
}
const rows = [
	{ id: '1', name: 'Ada' },
	{ id: '2', name: 'Grace' },
	{ id: '3', name: 'Bob' },
]

const lower = filterGridRows(schema, rows, [{ column: 'name', operator: 'contains', text: 'a' }])
const upper = filterGridRows(schema, rows, [{ column: 'name', operator: 'contains', text: 'A' }])

lower.map((row) => row.name) // ['Ada', 'Grace']
upper.map((row) => row.name) // ['Ada'] — `contains` is case-sensitive
filterGridRows(schema, rows, []).length // 3 — no filter refuses nothing
```

### Pagination

`page` is the state, counted from one. `offset` and `count` are worked out from it and from the rows
the filter admits, so nothing here can drift out of step with what the grid holds.

- `limit` is how many rows a page holds, or `undefined` when the grid is not paged. An unpaged grid
  reports `page` 1, `offset` 0, and `count` 1, and its `view` is every row the filter admits.
- `offset` counts the rows skipped, from zero, which is exactly what a database query asks for.
- `count` is `max(1, ceil(rows / limit))`, so a paged grid whose filter admits no rows still
  reports one page, and that page's `view` is empty. There is no page zero, and a host drawing
  "page 1 of 1" over an empty list needs no separate case for it.
- A page beyond the last one clamps to the last one. Narrowing the filter therefore moves the page
  on its own, and moving to page 9 of 3 shows page 3 rather than nothing.
- `resize` keeps the first row the view was showing, so the page moves to wherever that row
  falls. Resizing is a change of magnification, not a jump to the top.

```ts
import { createGrid } from '@orkestrel/table'

const grid = createGrid(
	{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
	{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }], limit: 2 },
)

grid.pagination.count // 3 — five rows, two to a page
grid.pagination.move(9)
grid.pagination.page // 3 — clamped to the last page
grid.pagination.offset // 4
grid.view.map((row) => row.id) // ['5']

grid.pagination.resize()
grid.pagination.limit // undefined — not paged
grid.view.length // 5
```

This vocabulary is deliberately the one `@orkestrel/database` and `@orkestrel/relation` already use:
`ascending` and `descending` for direction, a zero-based `offset` that means rows skipped, and
`limit` for the page size. A host doing server-side paging reads `sort.orders()`,
`filter.filters()`, and `pagination.offset` and `pagination.limit`, and hands them to a query
untranslated. Nothing is imported from either package and nothing is re-exported: the compatibility
is in the words, so each side agrees without depending on the other.

### Selection and expansion

Selection and expansion hold `GridKey` sets and nothing else, and each offers the same verbs:
`select` and `expand` add, `clear` removes, and `toggle` turns one row around. Each takes no argument to mean
every row, one key to mean one row, and a key list to mean those rows, and a list is checked in full
before any of it moves.

Selecting with no argument picks **every row the grid holds** — not every visible one. A host
offering a header checkbox that picks the page hands that page's keys over instead, which is one
line over `view` and keeps the ambiguity where the host can see it.

```ts
import { createGrid } from '@orkestrel/table'

const grid = createGrid(
	{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
	{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }] },
)

grid.selection.select(grid.view.map((row) => String(row.id))) // the page, not the grid
grid.selection.keys.size // 3

grid.selection.toggle('2')
grid.selection.keys.has('2') // false

grid.rows.remove('1')
grid.selection.keys.has('1') // false — a row that leaves takes its key with it
```

What an opened row shows beside it is the host's to draw. Expansion says which rows are open and
stops there.

```ts
import { createGrid } from '@orkestrel/table'

const grid = createGrid(
	{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
	{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }] },
)

grid.expansion.expand() // no argument — every row the grid holds
grid.expansion.keys.size // 3

grid.expansion.clear('2')
grid.expansion.expand(['2', '9']) // false — '9' names no row, so neither one opened
grid.expansion.keys.has('2') // false

grid.expansion.toggle('2')
grid.expansion.keys.size // 3
```

The selection and the expansion manager are the same algorithm over their own key set, so it is
written once, and so is the shell around it. `KeyManager`, the shared key-set shell, holds the store reads, the lifecycle gate, and the
announcement, and each manager supplies only its own verbs and its own event. The shell is internal,
like the managers that compose it.

`computeKeys` is the key-set engine underneath the shell, and it is published. It takes the keys a
caller may address, the set as it stands, the 0/1/N argument, and a decision made per key from that
key's own membership. It returns `undefined` when any requested key is unknown, which is the `false`
those verbs report. It returns the set it was handed when nothing moved, which is how a no-op stays
silent. Otherwise it returns the next set. A host keeping a third key set of its own gets the same
atomicity without writing it again.

```ts
import { computeKeys } from '@orkestrel/table'
import type { GridKey } from '@orkestrel/table'

const known: readonly GridKey[] = ['1', '2', '3']
const picked: ReadonlySet<GridKey> = new Set(['1'])

computeKeys(known, picked, '2', () => true)?.size // 2 — '2' joins '1'
computeKeys(known, picked, '9', () => true) // undefined — '9' is not a key the caller may address
computeKeys(known, picked, '1', () => true) === picked // true — nothing moved, so nothing is announced
computeKeys(known, picked, undefined, (included) => !included)?.size // 2 — every key turned around
```

## Lifecycle and state

A grid is a live projection, not a document that settles. It has no terminal success state, no
submit, and no result: rows arrive and leave for as long as the host holds it, and every read
answers from what it holds at that moment.

The verbs that end things end different things.

- **`clear` resets, and the grid stays open.** Every row goes, and sort, filter, selection,
  expansion, and the page all reset to how the grid opened. The schema and the options do not move.
  A cleared grid takes rows again immediately.
- **`destroy` tears down, and the grid stays readable.** Calling it twice does what calling it once
  did. Afterwards every write raises `GridError` coded `DESTROYED`, while every getter still answers
  what the grid last held — so a host can read its way out of teardown without catching anything.

`destroyed` is the readable fact, and it exists so a host handed a `GridInterface` it did not
construct does not have to use an exception as control flow.

```ts
import { createGrid, isGridError } from '@orkestrel/table'

const grid = createGrid(
	{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
	{ rows: [{ id: '1' }, { id: '2' }] },
)

grid.clear()
grid.count // 0
grid.rows.add({ id: '3' }) // a cleared grid is still open

grid.destroy()
grid.destroy() // idempotent
grid.destroyed // true
grid.count // 1 — every getter still answers

try {
	grid.rows.add({ id: '4' })
} catch (error) {
	if (isGridError(error)) error.code // 'DESTROYED'
}
```

A write is every call that could change what the grid holds: `rows.add`, `rows.update`,
`rows.move`, `rows.remove`, `sort.set`, `sort.remove`, `filter.set`, `filter.remove`,
`selection.select`, `selection.clear`, `selection.toggle`, `expansion.expand`, `expansion.clear`,
`expansion.toggle`, `pagination.move`, `pagination.resize`, and the grid's own `clear`. Every one of
them raises `DESTROYED` after teardown. `destroy` itself does not.

## Events

Each event carries the fact that moved. No listener sees a state the grid has not finished writing.
An event fires only when something actually moved: a write that changes nothing announces nothing.

| Event      | Payload                    | Fires                                                                                                                                                                      |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `write`    | the row's `key`            | Once per row admitted, written over, or moved to a different place, in the order the grid wrote them. A listener that wants the row reads it back.                         |
| `remove`   | the row's `key`            | Once per row taken out, in the order the grid removed them. A `clear` is the exception; see its row.                                                                       |
| `sort`     | every current `GridOrder`  | Whenever the term list's content changes, carrying the whole list as it stands.                                                                                            |
| `filter`   | every current `GridFilter` | Whenever the filter list's content changes, carrying the whole list as it stands.                                                                                          |
| `select`   | the picked `GridKey` set   | Whenever the picked set changes, carrying the whole set — including when removing rows pruned it.                                                                          |
| `expand`   | the opened `GridKey` set   | Whenever the opened set changes, carrying the whole set — including when removing rows pruned it.                                                                          |
| `paginate` | the `page` shown           | Whenever the paged window moves: a `move`, a `resize`, and a clamp caused by a narrower filter or by rows leaving.                                                         |
| `clear`    | nothing                    | On a completed `clear`. It is the whole announcement of that reset: no `remove`, no `sort`, no `filter`, no `select`, no `expand`, and no `paginate` is emitted beside it. |

A payload is owned by the listener. `sort` and `filter` carry the whole axis because a single term is
unreadable without the rest, and `select` and `expand` carry the same `ReadonlySet` shape the
managers' `keys` getters publish — one concept, one shape, emitted as a copy so nothing a listener
holds moves underneath it.

One call can announce more than one thing, and the order is fixed: **the rows first, then the axes
they disturbed, in the order `select`, `expand`, `paginate`.** Removing two picked rows from a paged
grid therefore emits `remove`, `remove`, `select`, and then `paginate` if the page had to clamp.

`GridOptions.rows` seeds quietly. Seeding announces nothing at all, so a grid opens silent and
every later write is heard.

Wire listeners at construction through `GridOptions.on`, or afterwards through the `emitter`. Each
reaches the same typed emitter, and a listener that throws is isolated and reported to
`GridOptions.error` rather than breaking its siblings or the grid.

```ts
import { createGrid } from '@orkestrel/table'

const seen: string[] = []

const grid = createGrid(
	{
		key: 'id',
		columns: [
			{ cell: 'text', key: 'id' },
			{ cell: 'number', key: 'age' },
		],
	},
	{
		rows: [{ id: '1', age: 36 }],
		on: {
			write: (key) => seen.push(`write ${key}`),
			sort: (orders) => seen.push(`sort ${orders.length}`),
		},
		error: (error) => console.error(error),
	},
)

grid.emitter.on('clear', () => seen.push('clear'))

grid.rows.add({ id: '2', age: 45 })
grid.sort.set({ column: 'age', direction: 'ascending' })
grid.sort.set({ column: 'age', direction: 'ascending' }) // the same term twice
grid.clear()

seen // ['write 2', 'sort 1', 'clear'] — the repeated term moved nothing and said nothing
```

## Wire safety

A schema is data, so it travels whole. It carries no function, nothing is dropped on the way, and
`serializeGrid` and `parseGrid` are the two ends of that trip.

```ts
import { parseGrid, serializeGrid } from '@orkestrel/table'
import type { GridSchema } from '@orkestrel/table'

const schema: GridSchema = {
	name: 'people',
	label: 'People',
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id', label: 'Reference' },
		{ cell: 'number', key: 'age', label: 'Age', meta: { align: 'right' } },
	],
}

const wire = JSON.stringify(serializeGrid(schema))
const received = parseGrid(JSON.parse(wire))

JSON.stringify(serializeGrid(received ?? schema)) === wire // true
parseGrid({ key: 'id', columns: 'not a list' }) // undefined
parseGrid({ columns: [{ cell: 'text', key: 'id' }] }) // undefined — no `key`
```

The round trip is byte-stable because both projections fix the order they emit in: `serializeGrid`
writes a schema's members in declaration order and a column's in the order the contract declares
them, and `serializeRows` writes each row's cells in the schema's column order. Ordering is what
turns "the same data" into "the same bytes", and it is the only reason a caller can compare two wire
forms with `===` instead of walking them.

That is canonicalization, not preservation. A projection reorders whatever it was handed: an object
written `columns` before `key` comes back with `key` before `columns`, because declaration order is
the order the contract declares and not the order the caller typed. So the bytes settle at the first
projection, and every projection after it — of that schema, or of what `parseGrid` returned from
those bytes — reproduces them exactly. Compare two wire forms, never a wire form against arbitrary
incoming bytes.

Rows travel too, and they arrive as strings far more often than not — a query string, a form post, a
CSV cell. `parseRows` coerces a numeric string into a `number` for a `number` column, and `'true'` or
`'false'` into a boolean for a `flag` column, and nothing else. Every other value must already have
its column's shape.

`parseRows` is strict in every other direction. It reads rows against the schema, so a key the
schema does not declare refuses the whole payload, a cell its column cannot hold refuses the whole
payload, and so does a row with no usable identity or an identity another row already used. A JSON
`null` is a cell no column can hold, and it is the refusal a wire producer meets most often: absence
here is an absent key, so a producer writing `null` for an empty field drops the key instead. There is
no partial result, because a half-accepted row set is worse than a rejected one — and the door where
identity is checked is this one, so nothing that reaches the grid has to be checked for it twice.

```ts
import { parseRows, serializeRows } from '@orkestrel/table'
import type { GridSchema } from '@orkestrel/table'

const schema: GridSchema = {
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'number', key: 'age' },
		{ cell: 'flag', key: 'active' },
	],
}

parseRows(schema, [{ id: '1', age: '36', active: 'true' }]) // [{ id: '1', age: 36, active: true }]
parseRows(schema, [{ id: '1', age: 'old' }]) // undefined — not a number
parseRows(schema, [{ id: '1', age: null }]) // undefined — JSON's null is not an absent cell
parseRows(schema, [{ id: '1' }, { id: '1' }]) // undefined — one identity, twice
parseRows(schema, [{ id: '1', colour: 'red' }]) // undefined — no such column
serializeRows(schema, [{ age: 36, id: '1' }]) // [{ id: '1', age: 36 }] — schema column order
```

**What never travels is everything that is not the document.** `GridOptions` does not: `on`,
`error`, `comparators`, and `matchers` are functions or hold them, and a function has no wire form.
Neither does live state — the sort terms, the filters, the picked and opened keys, and the page are
the lens a session is looking through, not the data it is looking at. A host that wants to persist a
lens reads `sort.orders()`, `filter.filters()`, `selection.keys`, and `pagination.page` and stores
them at its own door, in its own format. This package ships no parser for them, because it would be
a parser for the host's decision rather than for the grid's document.

The guards are the same boundary read one value at a time, and every one of them is total.

```ts
import {
	isColumnCell,
	isColumnChoice,
	isGridCell,
	isGridColumn,
	isGridRow,
	isGridSchema,
} from '@orkestrel/table'

isColumnCell('choice') // true
isColumnCell('date') // false — a date is `text` holding an ISO string
isGridCell(36) // true
isGridCell(null) // false — absence is an absent key, never null
isGridRow({ id: '1', age: 36 }) // true
isGridRow({ id: ['1'] }) // false
isColumnChoice({ value: 'a', label: 'A' }) // true
isColumnChoice({ value: 'a', label: 'A', colour: 'red' }) // false — an unknown member refuses it
isGridColumn({ cell: 'choice', key: 'status', choices: [] }) // true — structure only
isGridSchema({ key: 'id', columns: [{ cell: 'text', key: 'id' }] }) // true
isGridSchema({ columns: [] }) // false — `key` is required
```

The schema guards are where the boundary is drawn twice, because a schema can be the right shape
and still be a grid nobody could open. `isStructuralGridSchema` answers the shape;
`isGridSchema` answers the shape and the audit together, and it is the single-call guard consumers
and parsers read. The constructor reads `isStructuralGridSchema` and runs `auditGrid` once so its
`SCHEMA` message retains the diagnostics.

```ts
import { isStructuralGridSchema, isGridSchema, parseGrid } from '@orkestrel/table'

const unsound = { key: 'missing', columns: [{ cell: 'text', key: 'id' }] }

isStructuralGridSchema(unsound) // true — every member is present and typed
isGridSchema(unsound) // false — `key` names no declared column
parseGrid(unsound) // undefined — the parser refuses exactly what the guard refuses
isStructuralGridSchema({ columns: [] }) // false — `key` is required by the shape itself
```

### Owning what arrives

The cloners are how a value stops being the caller's. The grid clones the schema at construction and
every row at admission, and it clones every row it hands back. They are exported because a consumer
building its own row store needs the same guarantee.

Construction guards the schema it was handed, owns a copy, and then guards and audits that copy, so
the schema a grid opens against is the one it validated. A schema whose property reads and stored
values disagree — a proxy answering a read with one value while holding another — is refused with
`SCHEMA` instead of opened.

```ts
import { cloneRow, cloneGridSchema } from '@orkestrel/table'

const row = { id: '1', age: 36 }
const owned = cloneRow(row)

owned === row // false
Object.isFrozen(owned) // true

Object.isFrozen(cloneGridSchema({ key: 'id', columns: [{ cell: 'text', key: 'id' }] })) // true
```

### Budgets

The budgets bound how much a schema can be, so a document that arrives from a wire cannot cost
unbounded memory or unbounded scanning before anything decides to trust it. This package exports
`COLUMN_LIMIT`, and `@orkestrel/contract` exports `CHOICE_LIMIT`, `NAME_LIMIT`, `STRING_LIMIT`,
`TEXT_LIMIT`, and `NODE_LIMIT`, so a host can check against the same number the package checks
against.

| Constant       | Value   | Unit                    | Bounds                                    |
| -------------- | ------- | ----------------------- | ----------------------------------------- |
| `COLUMN_LIMIT` | 256     | columns                 | One schema's `columns`                    |
| `CHOICE_LIMIT` | 1024    | choices                 | One `choice` column's list                |
| `NAME_LIMIT`   | 128     | UTF-16 code units       | Each schema name and column key           |
| `STRING_LIMIT` | 65536   | UTF-16 code units       | Any one retained string                   |
| `TEXT_LIMIT`   | 1048576 | UTF-16 code units       | Every string one schema retains, together |
| `NODE_LIMIT`   | 16384   | records, arrays, leaves | Everything one schema retains, together   |

They bind at the schema door and the value door, and which door a limit sits at is the whole story.

**The schema door reports.** `auditGrid` counts columns, choices, names, strings, total text, and
total nodes — `meta` included, because it is retained like everything else — and returns one human
diagnostic per breach. `createGrid` raises `SCHEMA` carrying them and `parseGrid` refuses the
schema, so no over-budget schema is ever held.

**The value door refuses.** `matchesCell` checks `STRING_LIMIT`, from `@orkestrel/contract`, on any
string before it consults the column, so an over-long cell is refused before anything else looks at
it. `rows.add`, `rows.update`, and a seeded row raise `CELL`; `parseRows` returns `undefined`.

`STRING_LIMIT`, from `@orkestrel/contract`, is the one that stands at each door, so no string this
package retains is longer than 65536 code units whichever way it arrived.

The whole-schema ceilings are what make the arithmetic safe. Whatever the per-item limits admit,
one audited schema retains at most 1048576 string code units and at most 16384 nodes, so the worst
case is those ceilings rather than the product of the others.

Rows and the structural read stay unbounded, each for its own reason. **Rows are not budgeted**: a
grid legitimately holds a million of them, and a ceiling here would be product policy wearing a
constant's name. And the structural **read** at the parse door is not bounded either — `parseGrid`
copies and guards every column that arrived before the audit sees one of them, so a payload four
times over `COLUMN_LIMIT` is read four times over and then refused. Bound the size of a payload at
the transport that delivers it, which is the only layer holding the bytes.

### Auditing a schema

`auditGrid` is the semantic pass beyond structural validation. It reports the domain faults listed
following and every budget breach stated earlier. The shape alone cannot see them, except an unownable `meta`,
which the structural guard also refuses so the doors stay in agreement:

- `key` names no declared column.
- `key` names a `number` or `flag` column, whose cells can never hold a string identity.
- A column key is declared more than once.
- A column key is empty.
- A `choice` column offers the same value more than once.
- A `choice` column offers no choice at all, so it is a column no cell could ever fill.
- A column's `meta` cannot be owned as exact JSON.

The audit runs inside `createGrid` and inside `parseGrid`, so a consumer rarely calls it directly —
but it is exported, because a schema editor wants the diagnostics before it constructs anything.
`isGridSchema` is this list's emptiness over a structurally exact value, and nothing else, so the
guard, the constructor, and the parser cannot disagree about which schemas a grid can be opened
against. The guard is the yes-or-no; the audit is why.

**It returns human diagnostics, not a machine contract.** Read them, show them, log them. Do not
branch on their text or parse a column key out of them: the wording is free to change with the
diagnostics, and only the emptiness of the list is a promise. It returns a string list rather than a
`Result` for exactly that reason — a `Result` would dress a diagnostic list as an outcome and invite
a consumer to treat one as the other. Where a machine outcome is what you need, use the guards, or
use `parseGrid` and read `undefined`.

```ts
import { auditGrid } from '@orkestrel/table'

auditGrid({ key: 'ref', columns: [{ cell: 'text', key: 'id' }] })
// ['schema key "ref" names no declared column']
auditGrid({ key: 'age', columns: [{ cell: 'number', key: 'age' }] })
// ['schema key "age" names a number column, which holds no identity']
auditGrid({
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'text', key: 'id' },
	],
})
// ['column "id" is declared more than once']
auditGrid({ key: 'id', columns: [{ cell: 'text', key: 'id' }] }) // []
```

## Methods

The public methods of the behavioral interfaces, which their classes implement exactly and add
nothing to. Every readonly data member stays in the `## Surface` rows stated earlier, in each
interface's `Signature` cell, and is not repeated here.

Every other row in the Surface tables is a data shape, a union, a constant, a function, or an error
class, so none of them carries a method table. `CellComparator` and `CellMatcher` are callable
function types with one call signature and no named members.

Where a method takes no argument, one key, or a key list, that is one method with overloads rather
than several methods. A list is checked in full before any of it moves, and the call returns
`true` only when every name in it names what its manager addresses: a row the grid holds for
`rows`, `selection`, and `expansion`, and a column the schema declares for `sort` and `filter`. So
`selection.clear('9')` is `false` for a key no row carries, while `sort.remove('age')` is `true` for
a declared `age` column nothing was sorting by — the column exists, and afterwards nothing sorts by
it either way.

#### `GridInterface`

| Method    | Returns | Summary                                                                                                                  |
| --------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `clear`   | `void`  | Puts the grid back the way it opened, holding nothing. Rows, sort, filter, selection, expansion, and the page all reset. |
| `destroy` | `void`  | Tears the grid down. Idempotent; afterwards every write raises `DESTROYED` and every getter still answers.               |

#### `RowManagerInterface`

| Method    | Returns                  | Summary                                                                                                             |
| --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `row`     | `GridRow` or `undefined` | Finds one row by key; `undefined` when the grid holds no such key.                                                  |
| `rows`    | `readonly GridRow[]`     | Reads every row the grid holds, in its own order — unfiltered, unsorted, and unpaged.                               |
| `add`     | `void`                   | Takes in one row or several, appending them in the order given. Every row is checked before any is admitted.        |
| `update`  | `boolean`                | Writes over one row or several, each found by the key it carries. The cells given replace; the cells left out stay. |
| `replace` | `boolean`                | Replaces complete rows under existing keys, removing omitted cells without moving identities.                       |
| `move`    | `boolean`                | Moves one row to another place in the grid's own order, counted from zero and clamped to the rows that exist.       |
| `remove`  | `void` or `boolean`      | Takes out every row, one row, or several. Selection and expansion drop the keys of the rows that went.              |

#### `TableBindingInterface`

| Method    | Returns | Summary                                                                           |
| --------- | ------- | --------------------------------------------------------------------------------- |
| `refresh` | `void`  | Reconciles and renders the document, retrying a failed renderer.                  |
| `destroy` | `void`  | Releases listeners and restores owned attributes without destroying the document. |

#### `SortManagerInterface`

| Method   | Returns                    | Summary                                                                                                                                                                   |
| -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order`  | `GridOrder` or `undefined` | Finds one column's term; `undefined` when nothing sorts that column.                                                                                                      |
| `orders` | `readonly GridOrder[]`     | Reads every term the grid sorts by, first to last, in the order they decide.                                                                                              |
| `set`    | `void`                     | Sorts by one column or several. A term for a column already sorted replaces its direction in place; every other term joins the end. An undeclared column raises `COLUMN`. |
| `remove` | `void` or `boolean`        | Stops sorting by everything, by one column, or by several. An undeclared column returns `false` and stops nothing.                                                        |

#### `FilterManagerInterface`

| Method    | Returns                     | Summary                                                                                                                                                                                                       |
| --------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filter`  | `GridFilter` or `undefined` | Finds one column's filter; `undefined` when nothing filters that column.                                                                                                                                      |
| `filters` | `readonly GridFilter[]`     | Reads every filter the grid keeps rows by, in the order they were set.                                                                                                                                        |
| `set`     | `void`                      | Filters one column or several. A filter for a column already filtered replaces it; every other one joins the end. An undeclared column raises `COLUMN`, and a filter the column does not admit raises `CELL`. |
| `remove`  | `void` or `boolean`         | Stops filtering everything, one column, or several. An undeclared column returns `false` and stops nothing.                                                                                                   |

#### `SelectionManagerInterface`

| Method   | Returns             | Summary                                                                                              |
| -------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `select` | `void` or `boolean` | Picks every row the grid holds, one row, or several. Every row, not every visible one.               |
| `clear`  | `void` or `boolean` | Drops every pick, one pick, or several. A known key that was not picked still answers `true`.        |
| `toggle` | `boolean`           | Picks one row, or drops it when it is already picked; over a list, turns each row around on its own. |

#### `ExpansionManagerInterface`

| Method   | Returns             | Summary                                                                                             |
| -------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `expand` | `void` or `boolean` | Opens every row the grid holds, one row, or several.                                                |
| `clear`  | `void` or `boolean` | Closes every row, one row, or several. A known key that was not open still answers `true`.          |
| `toggle` | `boolean`           | Opens one row, or closes it when it is already open; over a list, turns each row around on its own. |

#### `PaginationManagerInterface`

| Method   | Returns | Summary                                                                                                             |
| -------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `move`   | `void`  | Shows another page, counted from one and clamped to the pages that exist.                                           |
| `resize` | `void`  | Sets how many rows a page holds, keeping the first row the view was showing. Leave the argument out to stop paging. |

### Errors

`GridError` carries a machine-readable `code` and an optional structured `context`. Narrow a caught
value with `isGridError` and branch on `code`; never match on message text.

| Code        | Raised when                                                                                                                                                                                                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCHEMA`    | The schema is not a grid schema, or `auditGrid` found a domain fault or a budget breach — `createGrid` and the `Grid` constructor raise those. `serializeGrid` and `cloneGridSchema` raise it at their own door for a `meta` no clone can own, which the guard and the audit refuse first for every schema whose reads are stable. |
| `COLUMN`    | A term or a filter names a column the schema does not declare.                                                                                                                                                                                                                                                                     |
| `KEY`       | A row's identity is missing, unusable, already taken, or repeated inside one batch.                                                                                                                                                                                                                                                |
| `CELL`      | A cell is one its column cannot hold, or a filter's operator or operand is one its column cannot take.                                                                                                                                                                                                                             |
| `DESTROYED` | A write reached a grid that has been torn down.                                                                                                                                                                                                                                                                                    |

```ts
import { createGrid, isGridError } from '@orkestrel/table'

try {
	createGrid({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] })
} catch (error) {
	if (isGridError(error)) error.code // 'SCHEMA'
}

const grid = createGrid({
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'number', key: 'age' },
	],
})

try {
	grid.sort.set({ column: 'nope', direction: 'ascending' })
} catch (error) {
	if (isGridError(error)) error.code // 'COLUMN'
}

try {
	grid.rows.add({ id: '1', age: 'twelve' })
} catch (error) {
	if (isGridError(error)) error.code // 'CELL'
}

grid.rows.rows().length // 0 — a refused write changed nothing
```

`createGrid` and `new Grid(...)` are the same construction. Prefer the factory at a call site that
only needs `GridInterface`; reach for the class where a class holds a grid as its own field and
wants the concrete type.

```ts
import { Grid } from '@orkestrel/table'

const grid = new Grid(
	{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
	{ rows: [{ id: '1' }] },
)

grid.count // 1
```

## Contract

These invariants hold across [`src/core`](../src/core) and this guide.

1. **Documented surface equals exported surface.** Every row in the `## Surface` tables is a real
   barrel export of `src/core` or `src/browser`, and every barrel export is a row — both directions, exhaustively.
   The manager classes and the key-set shell are internal, so the parity suite's internal list names
   them and nothing else.
2. **Documented methods equal interface methods.** Each `## Methods` table lists exactly its
   interface's call-signature members, and each class implements every one and adds no public
   behavior beyond them. Each interface has one table and one class.
3. **Identity is a declared column's non-empty string cell.** `GridSchema.key` is required and must
   name a declared column. A row whose cell there is missing, empty, or not a string is refused with
   `KEY`, and so is a key the grid already holds or a key repeated inside one batch. There is no
   default column, no positional fallback, and no key generation anywhere in this package.
4. **A row is owned at admission and at every read.** The grid clones and freezes each row it
   admits and each row it hands back, and clones and freezes the schema at construction. An edit to
   the object a caller passed changes nothing inside the grid, and no getter returns a live internal
   reference.
5. **A write is all-or-nothing, and it refuses by raising or by returning `false`.** `rows.add`,
   `rows.update`, `rows.remove`, `sort.set`, `sort.remove`, `filter.set`, `filter.remove`, and every
   0/1/N verb on selection and expansion check the whole argument before any of it lands. A bad
   value raises `KEY`, `CELL`, or `COLUMN`. A name that nothing answers to returns `false` and raises
   nothing — an unheld row key for `rows`, `selection`, and `expansion`, and an undeclared column for
   `sort.remove` and `filter.remove`. Either way the grid is left exactly as it was.
6. **`update` merges and cannot move a key.** The cells given replace the cells held and the cells
   left out stay as they are, and the row is found by the key it carries — so no sequence of
   `update` calls changes any row's identity.
7. **The view is derived, never stored.** `view`, `count`, `pagination.offset`, and
   `pagination.count` are worked out on every read from the rows, the filters, the terms, and
   `page`. Nothing caches them, so none of them can disagree with what the grid holds.
8. **The lens applies in one order.** `view` is filtered, then sorted, then paged, always. A filter
   therefore decides `count` and the page count, and paging never reorders anything.
9. **Sorting is stable and its terms are ordered.** The first term decides and each later term
   breaks the tie the ones before it left; rows no term separates keep the row store's own order.
   Setting a term for an already-sorted column replaces its direction in place and does not move it
   in the list. A `choice` column compares by the order its `choices` declares, a `flag` compares
   false before true, a `number` by magnitude, and a `text` lexically. An absent cell sorts before
   every present one in ascending order.
10. **Filters are and-only, one per column.** The grid holds at most one filter per column and
    keeps the rows every one of them accepts. There is no either-or composition and no nesting. An
    operator its column's cell does not admit, and an operand its column cannot hold, are both `CELL`
    refusals rather than empty results.
11. **An override replaces one column's default and nothing else.** A `comparators` or `matchers`
    entry is consulted only for the column its key names, receives `undefined` for a row carrying no
    cell there, and never changes which columns exist. A comparator always describes ascending order
    and `GridDirection` is applied to its result. An entry naming an undeclared column is never
    consulted and is not an error.
12. **Selection and expansion hold keys, and prune.** Both hold `GridKey` sets only, so a pick
    survives a sort, a filter, and a page turn; and a row leaving the grid removes its key from
    both. Selecting with no argument picks every row the grid holds, not every row in `view`.
13. **Pagination is derived and clamps.** `page` is the only stored fact, counted from one;
    `offset` is `(page - 1) * limit` and zero when unpaged; `count` is `max(1, ceil(rows / limit))`
    and `1` when unpaged — so a paged grid with no admitted rows holds one page, and that page's
    `view` is empty. A page beyond the last clamps to the last, including when a filter or a removal
    shrinks the rows underneath it. `resize` keeps the first row the view was showing.
14. **Every event fires after commit, and a no-op is silent.** No listener sees a state the grid has
    not finished writing, and a call that moves nothing announces nothing — the same sort term twice,
    a toggle back to where it was, a `move` to the index a row already occupies. When one call moves
    several things, the rows announce first and then the axes they disturbed, in the order `select`,
    `expand`, `paginate`. Seeded rows announce nothing at all.
15. **`clear` is one announcement and `destroy` is idempotent.** `clear` emits `clear` alone,
    whatever it reset, so a reset of ten thousand rows is one event. `destroy` called twice does what
    calling it once did; afterwards every write raises `DESTROYED` while every getter still answers
    what the grid last held, and `destroyed` reports the fact so a host need not catch to learn it.
16. **Guards are total and parsers refuse.** No `is*` throws for any input — unexpected prototype,
    symbol key, cycle, or depth. No `parse*` throws; each returns `undefined` on refusal. A
    guard-valid value is never refused by its parser, and every parsed result satisfies its guard.
    `isGridSchema` is therefore semantic and not merely structural: it is the exact shape plus an
    empty `auditGrid`, which is exactly what `parseGrid` and the `Grid` constructor demand.
    `isStructuralGridSchema` is the shape alone, for a caller running the audit itself.
17. **Only data crosses the wire, and the round trip is byte-stable.** `serializeGrid` and
    `serializeRows` emit in canonical order — a schema's members in declaration order, a column's in
    the order the contract declares them, and a row's cells in the schema's column order. Incoming
    key order is canonicalized rather than preserved, so the bytes settle at the first projection
    and every projection after it reproduces them, including a projection of what `parseGrid` or
    `parseRows` returned from those bytes. `meta` survives verbatim key for key. Options and live
    state have no projection at all: functions, sort terms, filters, picked keys, opened keys, and
    the page never travel.
18. **Identity is checked at the parse door.** `parseRows` refuses the whole payload when a row has
    no usable identity, when two rows share one, when a cell's column cannot hold it, or when a key
    names no declared column. It coerces a numeric string for a `number` column and `'true'` /
    `'false'` for a `flag` column, and nothing else.
19. **Every retained size is budgeted.** `auditGrid` reports a breach of this package's
    `COLUMN_LIMIT` or of the `@orkestrel/contract` budgets `CHOICE_LIMIT`, `NAME_LIMIT`,
    `STRING_LIMIT`, `TEXT_LIMIT`, and `NODE_LIMIT`, so `createGrid` raises `SCHEMA` and
    `parseGrid` refuses; `matchesCell` refuses a string breaching `STRING_LIMIT`, from
    `@orkestrel/contract`, before it consults the column, so a write raises `CELL` and `parseRows`
    returns `undefined`. `TEXT_LIMIT` and `NODE_LIMIT`, from `@orkestrel/contract`, are whole-schema
    ceilings, `meta` included, so the per-item limits never multiply. Row count is deliberately
    unbudgeted, and so is the structural read at the parse door, which is the transport's to bound.
20. **`auditGrid` returns diagnostics, not a contract.** The list's emptiness is the promise. The
    wording of its strings is not. Never parse them.
21. **Temporal values are ISO text compared lexically, under one spelling.** A date, a time, and a
    timestamp are `text` cells, and lexical order is chronological order only where a column's
    values share one offset — normally UTC `Z` — one precision, and normalized midnight spelling.
    Mixed offsets order by spelling: `'2026-01-01T00:00:00+01:00'` sorts after
    `'2025-12-31T23:30:00Z'` and names an instant half an hour earlier. So does mixed precision,
    because `'09:00'` sorts before `'09:00:00'`. `2026-01-01T24:00:00Z` and
    `2026-01-02T00:00:00Z` name the same instant but sort differently, so midnight must use the
    next day's `00:00:00Z`. A filter's operands must match their cells the same way. No calendar is
    consulted either, so `'2026-02-31'` is an ordinary cell here. Normalizing the spelling is the
    host's, and a `CellComparator` covers a column that cannot.

## Concept inventory

What this package deliberately does not do, and where the work goes instead. Each line is a boundary
taken on evidence, not an omission — so a reader can tell a boundary from a gap, and the next change
knows what it is reopening. `Layer` names who owns the concept, and a row reading **seam** is one
this package answers today through a mechanism it already exposes.

| Concept                      | Layer         | Why it sits there                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering                    | host          | The grid owns values, not pixels. It names no host type, so one grid serves a browser, a terminal, a report, and an export equally — and the moment it drew one of them it would serve only that one.                                                                                                                                                                                                                         |
| ARIA and roles               | host          | `label` and `help` are the strings an accessible table needs. The roles, the ids, and their uniqueness belong to the layer that owns the elements.                                                                                                                                                                                                                                                                            |
| Keyboard and focus           | host          | Arrow keys, roving focus, and type-ahead are input gestures over drawn cells. The grid has no cursor because it has no cells on a screen.                                                                                                                                                                                                                                                                                     |
| Virtualization               | host          | Which rows are cheap to draw is a measurement of drawn things. `pagination` already gives a windowing host `offset` and `limit`, and a virtualizer that wants the whole list leaves the grid unpaged and reads `view`, which is every admitted row in sort order. `rows()` is the store's own order and ignores the lens.                                                                                                     |
| Column resizing              | host          | A width is pixels. `meta` carries one when a host must ship it in the schema, and the grid never reads it.                                                                                                                                                                                                                                                                                                                    |
| Column reordering and hiding | seam          | `columns` order is presentation order and `hidden` is the flag. Reordering is building the next schema, which is one line over the array a host already holds.                                                                                                                                                                                                                                                                |
| Row drag-and-drop            | seam          | The gesture is the host's; the result is `rows.move(key, index)`, which is the one verb that writes the grid's own order.                                                                                                                                                                                                                                                                                                     |
| Sticky columns and headers   | host          | Which columns stay put while the rest scroll is a layout decision about drawn elements.                                                                                                                                                                                                                                                                                                                                       |
| Or-filters and nested groups | out           | v1 composes filters with **and** only, one per column, which is what a filter bar produces. The one thing it cannot express at all is the global search box that matches a term against every column: that is an or across columns, and a host wanting one narrows `rows()` with its own predicate and holds the result itself. Either-or turns a flat list into a tree and takes every guard, parser, and wire form with it. |
| Grouping and aggregation     | out           | Group headers, subtotals, and rollups add a second row kind that is not a row, and a fold that is not a filter. `view` stays a flat list of the rows the grid holds.                                                                                                                                                                                                                                                          |
| Tree and hierarchical rows   | out           | A parent key would make `view` a traversal rather than a projection, and expansion would mean "show children" instead of "this row is open". Expansion here says only which rows are open.                                                                                                                                                                                                                                    |
| Editing transactions         | out           | A staged edit set with commit and rollback is a second store beside the row store, and two writers that can disagree. A host that needs one holds the pending values and calls `update` once.                                                                                                                                                                                                                                 |
| Undo and history             | out           | The grid holds the rows. A stack of everything before is a host concern with a host's retention policy, built over the same `update` and `remove` calls.                                                                                                                                                                                                                                                                      |
| Async data sources           | host          | Every read here is synchronous, so `view` is right the instant anything moves. Fetching, paging a server, and reconciling a response are the host's; it reads the lens and calls `add` or `clear`.                                                                                                                                                                                                                            |
| Server-side paging           | seam          | `sort.orders()`, `filter.filters()`, `pagination.offset`, and `pagination.limit` are already the shape a query asks for, in the vocabulary `@orkestrel/database` uses.                                                                                                                                                                                                                                                        |
| Row count budget             | out           | A grid legitimately holds a million rows. The budgets bound one schema's declarations, which arrive from a wire; how many rows a host holds is the host's memory to spend.                                                                                                                                                                                                                                                    |
| Parsing a lens off the wire  | out           | Sort terms, filters, and the picked keys are what a session is looking through, not the document. A host persisting them owns the format, so a parser here would parse the host's decision.                                                                                                                                                                                                                                   |
| Case folding and collation   | seam          | `contains` compares case-sensitively and `text` compares with the language's own string order. Locale is a decision this package cannot make for a host, so a `CellMatcher` or `CellComparator` makes it.                                                                                                                                                                                                                     |
| A temporal cell              | out           | ISO text written to one canonical spelling per instant — one offset, one precision, and no alternate spelling of a given date or time — sorts chronologically already, so a temporal cell would add a variant that behaves exactly like `text` and a calendar to go with it. Normalizing to that one canonical representation is the host's, and a `CellComparator` covers a column that arrives mixed.                       |
| Calendar validity            | host          | `'2026-02-31'` is lexically fine and not a real day. A date control refuses it before it arrives, and a domain that needs the check adds it at its own door.                                                                                                                                                                                                                                                                  |
| Number and date formatting   | host          | A `number` cell is a number and a date is its ISO string. Turning either into what a person reads is locale work at the point of drawing, and `meta` carries the hint when a schema must ship one.                                                                                                                                                                                                                            |
| CSV and spreadsheet export   | host          | `view` or `rows()` plus `schema.columns` is the whole input an exporter needs, and the file format, encoding, and download belong to the host that has a filesystem or a browser.                                                                                                                                                                                                                                             |
| Cell-level selection         | out           | Selection holds row keys. A rectangular cell range is a second selection model with its own vocabulary, and no consumer has asked for one.                                                                                                                                                                                                                                                                                    |
| Choice `meta`                | out           | `meta` is on `ColumnBase` alone, because a column carrier is what the first consumer asked for. The exact guard refuses it on `ColumnChoice` until one asks.                                                                                                                                                                                                                                                                  |
| Browser binding              | `src/browser` | The browser entry binds native table rows and controls to a borrowed core document; the core remains host-independent.                                                                                                                                                                                                                                                                                                        |

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ barrel bijection, the
  interface ↔ class method bijections, and the equality gate: every `Summary` cell against its
  declaration's description paragraph, the titled `Open a grid` fence against the `@example` block
  of that title (pinned so the titled pair cannot be retired silently), and the README pitch against
  this guide's tagline. It also runs the preceding worked examples against the real source so a
  documented value that the code contradicts fails.
- [`tests/src/core/Grid.test.ts`](../tests/src/core/Grid.test.ts) — construction, schema
  ownership, seeding, the derived `view` and `count`, emission order, `clear`, `destroy`, and writes
  after teardown.
- [`tests/src/core/grids/RowManager.test.ts`](../tests/src/core/grids/RowManager.test.ts) —
  `row`, `rows`, `add`, `update`, `move`, `remove`, batch atomicity, and identity refusals.
- [`tests/src/core/grids/SortManager.test.ts`](../tests/src/core/grids/SortManager.test.ts) —
  `order`, `orders`, `set`, `remove`, in-place replacement, stability, and comparator overrides.
- [`tests/src/core/grids/FilterManager.test.ts`](../tests/src/core/grids/FilterManager.test.ts) —
  `filter`, `filters`, `set`, `remove`, and-composition, operator refusals, and matcher overrides.
- [`tests/src/core/grids/SelectionManager.test.ts`](../tests/src/core/grids/SelectionManager.test.ts)
  — `select`, `clear`, `toggle`, the 0/1/N overloads, and pruning on removal.
- [`tests/src/core/grids/ExpansionManager.test.ts`](../tests/src/core/grids/ExpansionManager.test.ts)
  — `expand`, `clear`, `toggle`, the 0/1/N overloads, and pruning on removal.
- [`tests/src/core/grids/KeyManager.test.ts`](../tests/src/core/grids/KeyManager.test.ts) — the
  0/1/N forms, the unknown-key refusal, the announcement only on a move, the owned key set, and the
  gate throw passed through.
- [`tests/src/core/grids/PaginationManager.test.ts`](../tests/src/core/grids/PaginationManager.test.ts)
  — `page`, `limit`, `offset`, `count`, `move`, `resize`, clamping, and the unpaged grid.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — `extractColumn`,
  `extractGridKey`, `computeKeys`, `mergeTerms`, `removeTerms`, `matchesTerms`, `matchesCell`,
  `compareCells`, `admitsFilter`, `matchesFilter`, `filterGridRows`, `sortGridRows`, `auditGrid`,
  `serializeGrid`, `serializeRows`, and the budgets.
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — every guard against
  valid, off-shape, and untrusted input, the cell registry, plus guard/parser soundness in both
  directions.
- [`tests/src/core/parsers.test.ts`](../tests/src/core/parsers.test.ts) — `parseGrid`, `parseRows`,
  the coercions, identity at the parse door, and the canonical byte-stable round trip.
- [`tests/src/core/cloners.test.ts`](../tests/src/core/cloners.test.ts) — every clone is owned,
  frozen, and deep enough that no caller reference survives.
- [`tests/src/core/errors.test.ts`](../tests/src/core/errors.test.ts) — `GridError`'s `code` and
  `context`, and `isGridError` narrowing.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — `createGrid` returns
  a working `GridInterface`.
- [`tests/src/core/index.test.ts`](../tests/src/core/index.test.ts) — the barrel resolves every
  documented export.

## See also

- [`AGENTS.md`](../AGENTS.md) — the coding contract this package is written against.
- [`README.md`](README.md) — the guides index.
