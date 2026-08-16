# Table

> The environment-agnostic tabular document. A `TableSchema` states what the columns are, a `Table`
> holds the rows given against it, and one lens — sort, filter, and page — decides which of them the
> view shows. Nothing here renders, measures a pixel, reads a keyboard, or names a host type.
>
> **A grid, a report, a terminal listing, and a CSV export are the same abstraction.** All four hold
> a set of records, order them, narrow them, and show a stretch of them. What differs is who draws
> the result, and drawing is the one part this package leaves out. The table owns values; the host
> owns everything a person looks at.
>
> The row store is the source of truth, and it is the whole of it. Sort terms, filters, the picked
> keys, the opened keys, and the page are held; `view` and every tally are worked out on read, so no
> second copy of an answer can go stale. A write validates all of itself before any of it lands, and
> announces itself once it has.
>
> The core refuses rather than throws. Every guard returns `false` off-shape rather than throwing, every
> parser returns `undefined` on refusal, and every row the table hands back is a frozen owned copy.
> Table-owned refusals raise `TableError`, and each one names a caller mistake.

## Surface

Open a table, narrow it, order it, and read the rows to draw:

```ts
import { createTable } from '@orkestrel/table'

const table = createTable(
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

table.filter.set({ column: 'name', operator: 'contains', text: 'a' })
table.sort.set({ column: 'age', direction: 'descending' })

table.count // 3 — every name holds a lowercase 'a'
table.pagination.count // 2 — two pages of two
table.view.map((row) => row.name) // ['Grace', 'Alan'] — page one, oldest first
```

Everything below is exported from `@orkestrel/table` ([`src/core`](../src/core)). Nothing is
internal: every declaration in the module is reachable from the barrel, so a consumer holds exactly
the mechanisms the package uses on itself.

### Rows, cells, and columns

The document itself — what a table declares and what one row of it holds. All data, no behavior.

| API            | Kind      | Summary                                                                                                                                        |
| -------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `TableKey`     | type      | A row's identity — a `string`, carried in the cell the schema's `key` names.                                                                   |
| `TableCell`    | type      | Every value a cell can hold — a `string`, a `number`, or a `boolean`.                                                                          |
| `TableRow`     | type      | One row keyed by column. A column nobody has filled has no key here.                                                                           |
| `ColumnCell`   | type      | What a column's cells hold — the four-member discriminant that fixes the column's options, its comparison, and the filters that apply to it.   |
| `ColumnChoice` | interface | One value a `choice` column offers — `value` is stored, `label` is read, `help` explains.                                                      |
| `ColumnBase`   | interface | What every column carries whatever its cells hold — `key` / `label` / `help` / `hidden` / `meta`.                                              |
| `TextColumn`   | interface | A column of text, compared lexically. Carries a date, a time, and a timestamp as ISO strings.                                                  |
| `NumberColumn` | interface | A column of numbers, compared by magnitude.                                                                                                    |
| `FlagColumn`   | interface | A column of yes-or-no answers, compared false before true.                                                                                     |
| `ChoiceColumn` | interface | A column drawn from a declared list, compared by the order that list declares — required `choices`.                                            |
| `TableColumn`  | type      | Any column a schema can declare — the four-member union discriminated on `cell`.                                                               |
| `TableSchema`  | interface | Everything a table declares about itself — optional `name` / `label` / `help`, the required `key` naming row identity, and `columns` in order. |

### The lens

The three axes a table reads its rows through, and the two slots that replace what a column's cell
fixes.

| API              | Kind      | Summary                                                                                                                              |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `TableDirection` | type      | Which way a column sorts — `'ascending' \| 'descending'`. A column nobody has sorted carries no term at all.                         |
| `TableOrder`     | interface | One column's place in the sort — the `column` and its `direction`. The list is read left to right.                                   |
| `FilterOperator` | type      | How a filter tests a cell — `'contains' \| 'between' \| 'equals'`.                                                                   |
| `ContainsFilter` | interface | Keep the rows whose cell holds this `text` somewhere inside it.                                                                      |
| `BetweenFilter`  | interface | Keep the rows whose cell falls between `minimum` and `maximum`, both included, compared the way the column compares.                 |
| `EqualsFilter`   | interface | Keep the rows whose cell holds exactly this `value`.                                                                                 |
| `TableFilter`    | type      | Any filter a table can hold — the three-member union discriminated on `operator`.                                                    |
| `CellComparator` | type      | Compare two cells of one column, replacing what its `cell` fixes. Always describes ascending order; direction is applied afterwards. |
| `CellMatcher`    | type      | Test one column's cell against a filter, replacing what its `cell` fixes. Receives every filter the table holds against that column. |

### The table

The entity, its six managers, its factory, its contract, and the error it raises.

| API                          | Kind      | Summary                                                                                                                               |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Table`                      | class     | A table — a schema, the rows held against it, and the lens they are read through. Implements `TableInterface` exactly.                |
| `TableInterface`             | interface | The table contract — the readonly state below plus `clear` and `destroy`.                                                             |
| `createTable`                | function  | Open a table against a schema. The schema is copied, and the copy is what the table declares.                                         |
| `TableOptions`               | interface | How to open a table — `on` listeners, an `error` handler, seeded `rows`, per-column `comparators` and `matchers`, and a page `limit`. |
| `TableEventMap`              | type      | Everything a table announces — `write` / `remove` / `sort` / `filter` / `select` / `expand` / `paginate` / `clear`.                   |
| `RowManagerInterface`        | interface | The rows the table holds, in its own order.                                                                                           |
| `RowManager`                 | class     | The row store. Implements `RowManagerInterface` exactly.                                                                              |
| `SortManagerInterface`       | interface | The order the table reads its rows in.                                                                                                |
| `SortManager`                | class     | The sort terms. Implements `SortManagerInterface` exactly.                                                                            |
| `FilterManagerInterface`     | interface | Which rows the table keeps.                                                                                                           |
| `FilterManager`              | class     | The filters. Implements `FilterManagerInterface` exactly.                                                                             |
| `SelectionManagerInterface`  | interface | The rows somebody has picked.                                                                                                         |
| `SelectionManager`           | class     | The picked keys. Implements `SelectionManagerInterface` exactly.                                                                      |
| `ExpansionManagerInterface`  | interface | The rows somebody has opened up.                                                                                                      |
| `ExpansionManager`           | class     | The opened keys. Implements `ExpansionManagerInterface` exactly.                                                                      |
| `PaginationManagerInterface` | interface | Which stretch of the filtered rows the view shows.                                                                                    |
| `PaginationManager`          | class     | The page arithmetic. Implements `PaginationManagerInterface` exactly.                                                                 |
| `TableError`                 | class     | An error raised by the table domain — a machine-readable `code` and optional structured `context`.                                    |
| `TableErrorCode`             | type      | The reason a `TableError` carries — `SCHEMA` / `COLUMN` / `KEY` / `CELL` / `DESTROYED`.                                               |
| `isTableError`               | function  | Whether a caught value is a `TableError`, so a `catch` branches on `code` without an assertion.                                       |

`TableInterface`'s readonly data members stay here rather than in `## Methods`: `emitter` (the typed
event surface), `schema` (the owned frozen copy), the six managers `rows`, `sort`, `filter`,
`selection`, `expansion`, and `pagination`, plus `view` (the rows to draw right now), `count` (how
many rows the filter admits), and `destroyed`. The managers carry readonly members of their own:
`selection.keys` and `expansion.keys` are the picked and opened key sets, and `pagination` publishes
`page`, `limit`, `offset`, and `count`.

Two members are spelled `count` and they answer two different questions, because each is the lone
tally of the entity it belongs to. `table.count` is **rows** — how many the filter admits, before the
page narrows them. `table.pagination.count` is **pages** — how many the admitted rows fill.

Each manager class is constructed by `Table` and exported because the contract it satisfies is
exported: a published interface publishes the parts that satisfy it, so nothing here is a mechanism
the package keeps for itself. Their constructors are not a documented surface. Each takes the
table's emitter and a set of closures over state the owning table keeps private, which is what keeps
every store single-owned, and it is not a protocol a consumer can satisfy from this guide. A
consumer writing its own table composes `Table`, or writes its own managers against the manager
interfaces and reads these classes as the working reference.

### Constants

The cell registry and six budgets. The registry is frozen, so a shared list cannot be rewritten
under a consumer. The budgets are numbers.

| API            | Kind  | Summary                                                                     |
| -------------- | ----- | --------------------------------------------------------------------------- |
| `COLUMN_CELLS` | const | Every column cell, in the order the public contract declares them.          |
| `COLUMN_LIMIT` | const | The most columns one schema may declare: 256.                               |
| `CHOICE_LIMIT` | const | The most choices one `choice` column may offer: 1024.                       |
| `NAME_LIMIT`   | const | The longest schema name or column key: 128 UTF-16 code units.               |
| `STRING_LIMIT` | const | The longest single retained string: 65536 UTF-16 code units.                |
| `TEXT_LIMIT`   | const | The most string code units one schema may retain in total: 1048576.         |
| `NODE_LIMIT`   | const | The most records, arrays, and leaves one schema may retain in total: 16384. |

### Guards

Total `is*` guards over unknown input. None throws, none coerces, and each returns `false` for
anything off-shape — including a hostile prototype, a symbol key, or a cyclic value.

| API                       | Kind     | Summary                                                                                                              |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `isTableCell`             | function | Whether a value has a cell shape — a string, a finite number, or a boolean.                                          |
| `isTableRow`              | function | Whether a value is a record whose every own key is a string and every value a `TableCell`.                           |
| `isColumnCell`            | function | Whether a value is one of the four declared column cells.                                                            |
| `isColumnChoice`          | function | Whether a value is one exact `ColumnChoice` record; an unknown member refuses it.                                    |
| `isTableColumn`           | function | Whether a value is one exact discriminated `TableColumn`, checked against its cell's own options.                    |
| `isStructuralTableSchema` | function | Whether a value has the exact shape of a `TableSchema` — the shape alone, with no domain check.                      |
| `isTableSchema`           | function | Whether a value is a `TableSchema` a table can be opened against — the exact shape, and an audit that finds nothing. |

Two of them answer about a schema, and which one to reach for is which question you are asking.
`isStructuralTableSchema` asks whether the shape is exact: every declared member present and typed,
and nothing else there. `isTableSchema` asks that and then asks `auditTable`, so it refuses a
schema-shaped value carrying a domain fault or a budget breach — a `key` naming no declared column,
a column key declared twice, a `choice` column offering nothing. It is the guard the parsers read.
The `Table` constructor asks the same questions through `isStructuralTableSchema` and one
`auditTable` run, so its `SCHEMA` message keeps the audit diagnostics intact. The guard, constructor,
and `parseTable` therefore agree on which schemas are usable. Reach for the structural guard where
you mean to run the audit yourself and read its diagnostics.

### Helpers

The pure leaves the table composes: the column lookup, the identity read, the key-set engine, the
cell gate, the comparison, the two filter tests, the two row passes, the audit, and the wire
projections. `computeKeys`, `filterRows`, and `sortRows` propagate exceptions from supplied
callbacks; `serializeTable` raises `SCHEMA` for a `meta` no clone can own. The other helpers are
total over ordinary declared inputs, subject to the core's hostile-reflection boundary below.

| API              | Kind     | Summary                                                                                                                    |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `extractColumn`  | function | Find one column by key; `undefined` when the schema declares no such column.                                               |
| `extractKey`     | function | Read a row's identity; `undefined` when its key cell is missing, empty, or not a string.                                   |
| `computeKeys`    | function | Work out one atomic 0/1/N membership change over the keys a caller may address — the engine selection and expansion share. |
| `matchesCell`    | function | Whether one column can hold a value — the shape gate every write and every seed passes through.                            |
| `compareCells`   | function | Compare two of one column's cells the way its `cell` fixes, describing ascending order.                                    |
| `admitsFilter`   | function | Whether one column admits a filter and every operand it carries — the gate `filter.set` and `matchesFilter` share.         |
| `matchesFilter`  | function | Test one of a column's cells against one filter the way its `cell` fixes.                                                  |
| `filterRows`     | function | Keep the rows every filter accepts, in the order given; a supplied `CellMatcher` replaces the default per column.          |
| `sortRows`       | function | Order rows by the terms given, stably; a supplied `CellComparator` replaces the default per column.                        |
| `auditTable`     | function | Audit a structurally valid schema for domain faults and budget breaches, returning human diagnostics.                      |
| `serializeTable` | function | Project a schema into JSON in declaration order, dropping every absent member; raises `SCHEMA` for a `meta` it cannot own. |
| `serializeRows`  | function | Project rows into JSON with each row's cells in the schema's column order, dropping every absent cell.                     |

### Cloners

Owned frozen snapshots. The table takes one of the schema at construction and one of every row at
admission, so a later edit to the object a caller passed changes nothing inside the table, and no
row the table hands back is a live internal reference.

| API           | Kind     | Summary                                                                                                                        |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `cloneRow`    | function | Own one row as a frozen copy of its cells.                                                                                     |
| `cloneSchema` | function | Own a whole schema, freezing every nested column, choice list, choice, and `meta`; raises `SCHEMA` for a `meta` it cannot own. |

`cloneRow` cannot fail for an ordinary row record, subject to the core's hostile-reflection boundary
below. `cloneSchema` can also fail when a column's `meta` holds something no clone can own, such as a
record that refers back to itself. `meta` is typed as JSON and a cycle satisfies that type, so the
refusal is a `TableError` coded `SCHEMA` rather than a silent partial copy. `createTable` never reaches
it, because `isTableColumn` admits only bounded, exactly ownable JSON there and refuses such a schema
first. This is the door a caller cloning or serializing a schema on its own meets, and
`serializeTable` refuses the same value the same way.

### Parsers

The wire boundary. Each returns `undefined` on refusal rather than throwing, and each returns an
owned value rather than the caller's.

| API          | Kind     | Summary                                                                                                       |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------- |
| `parseTable` | function | Parse unknown wire data into an owned, structurally valid, semantically sound schema.                         |
| `parseRows`  | function | Parse unknown wire data into owned rows against a schema, coercing a numeric string and `'true'` / `'false'`. |

**Hostile reflection.** A TypeScript shape does not guarantee that reflection succeeds. An ordinary
helper or cloner may propagate a throw from a proxy trap or accessor. Guards and parsers contain that
throw and refuse instead. This is the hostile-reflection boundary for the whole core.

## Cells

Four cells, and each one fixes three things at once: what the column's cells may hold, how two of
them compare, and which filter operators apply. Choosing the cell is the whole of a column's
behavior, which is why there is no `sortable`, no `filterable`, and no comparison declared beside it.

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

```ts
import type { TextColumn } from '@orkestrel/table'

const name: TextColumn = { cell: 'text', key: 'name', label: 'Name' }
```

`contains` is the operator a filter bar reaches for, and it compares **case-sensitively**. Case
folding is a locale decision this package cannot make for a host, so a table that wants it supplies
a `CellMatcher` for that column. The same is true of collation: `text` compares with the language's
own string order, not a locale-aware collator.

### number

```ts
import type { NumberColumn } from '@orkestrel/table'

const age: NumberColumn = { cell: 'number', key: 'age', label: 'Age' }
```

A cell must be a finite number. `NaN` and both infinities are values a column cannot hold, so a
write carrying one raises `TableError` coded `CELL`.

### flag

```ts
import type { FlagColumn } from '@orkestrel/table'

const active: FlagColumn = { cell: 'flag', key: 'active', label: 'Active' }
```

`flag` takes `equals` and nothing else. `contains` has no meaning against a boolean and `between`
has two members it could not order usefully, so a filter carrying either against a `flag` column
raises `TableError` coded `CELL`.

### choice

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

That is a boundary drawn on purpose, and it asks four things of the values a column holds. Every
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

`ColumnBase.meta` is a bounded JSON carrier for whatever the schema declines to model. The table
never reads it, no comparison sees it, no filter tests it, and it round-trips verbatim key for key.
This package defines no key in it, so every key belongs to the host: an alignment, a number format,
a pixel width, an icon name.

`hidden` sits beside it and is the one presentation fact the schema does carry, because hiding a
column changes nothing about the data. A hidden column is still sorted, still filtered, and still
serialized; whether it is drawn is the host's read of that flag.

### Reading a column

Two reads turn a column key into a decision, and both are exported because a host asking the same
question before it writes needs the same answer. `extractColumn` finds the column a key names, and
`matchesCell` is the gate every write, every seed, and every filter operand passes through.

```ts
import { extractColumn, matchesCell } from '@orkestrel/table'
import type { TableSchema } from '@orkestrel/table'

const schema: TableSchema = {
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

`TableOptions.comparators` and `TableOptions.matchers` are keyed by column key, and each entry
replaces — for that column alone — the comparison or the test its `cell` fixes. They are the reason
no function belongs in the schema: behavior is supplied where the table is opened, and the schema
stays data that crosses a wire whole.

```ts
import { createTable } from '@orkestrel/table'
import type { CellComparator, CellMatcher } from '@orkestrel/table'

const natural: CellComparator = (left, right) =>
	String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true })

const loose: CellMatcher = (cell, filter) =>
	filter.operator === 'contains' &&
	String(cell ?? '')
		.toLowerCase()
		.includes(filter.text.toLowerCase())

const table = createTable(
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

table.filter.set({ column: 'name', operator: 'contains', text: 'ADA' })
table.count // 1 — the matcher folded the case; the default would not have
```

An override receives `undefined` for a row carrying no cell there, so it decides absence for itself.
A comparator always describes ascending order and `TableDirection` is applied afterwards, so one
comparator serves both directions. An override for a column the schema does not declare is never
consulted and is not an error: the schema decides which columns exist, and the option only says how
one of them behaves.

## Identity

Every row carries its own identity, in the cell named by `TableSchema.key`, as a non-empty string.

`key` is **required**. It must name a declared column, and the table refuses a row whose cell there
is missing, empty, or not a string. There is no default column, no positional fallback, and no key
generation: an index is a position, and a position is not an identity — the moment a sort moves a
row, a position that named it names somebody else.

That is a deliberate divergence from `@orkestrel/database`, whose `DEFAULT_PRIMARY` assumes `id`
when a table declares no primary column. A database row arrives from a store that already gave it a
key, so assuming the usual name saves a declaration and costs nothing. A table's rows arrive from a
caller who may have joined, projected, or invented them in the browser, so the same assumption picks
a column that may not exist, or picks one that exists and is not unique. Declaring the key is one
line, and it is the line every refusal below is measured against.

```ts
import { createTable, isTableError } from '@orkestrel/table'

const table = createTable({
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'text', key: 'name' },
	],
})

table.rows.add({ id: '7', name: 'Ada' })

try {
	table.rows.add({ id: '7', name: 'Grace' })
} catch (error) {
	if (isTableError(error)) error.code // 'KEY' — already taken
}

try {
	table.rows.add({ name: 'Alan' })
} catch (error) {
	if (isTableError(error)) error.code // 'KEY' — no identity at all
}

table.rows.rows().length // 1 — a refused write changed nothing
```

Four rules follow from it, and each one is a refusal rather than a repair:

- **A key is unique.** `add` raises `KEY` for a key the table already holds, and for a key repeated
  inside one batch. Every row in the batch is checked before any is admitted, so one duplicate
  admits none of them.
- **A key cannot move.** `update` merges: the cells given replace the cells held and the cells left
  out stay as they are. A row is found by the key it carries, so writing a different key writes a
  different row — or writes nothing, if that row does not exist.
- **A row is owned.** The table clones and freezes a row at admission, so the object a caller keeps
  is no longer the row the table holds, and `row()` and `rows()` hand back frozen copies rather than
  internal references.
- **Selection and expansion hold keys.** Never rows, never positions. A pick survives a sort, a
  filter, and a page turn, and a row that leaves the table takes its key out of both sets with it.

`update` is where that second rule is felt. It merges, so a call carries only the cells it means to
change, and the row it writes is the one carrying the key it names — never a rename.

```ts
import { createTable } from '@orkestrel/table'

const table = createTable(
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

table.rows.update({ id: '1', age: 37 }) // true
table.rows.row('1') // { id: '1', name: 'Ada', age: 37 } — `name` was left out and stayed
table.rows.update({ id: '9', name: 'Nobody' }) // false — no row carries that key
table.rows.rows().length // 1 — a different key is a different row, so nothing was added
```

`extractKey` is the read those rules are built on, and it is exported because a host doing the same
check before it calls needs the same answer.

```ts
import { extractKey } from '@orkestrel/table'
import type { TableSchema } from '@orkestrel/table'

const schema: TableSchema = { key: 'id', columns: [{ cell: 'text', key: 'id' }] }

extractKey(schema, { id: '7' }) // '7'
extractKey(schema, { id: '' }) // undefined — empty is not an identity
extractKey(schema, { name: 'Ada' }) // undefined — no key cell at all
```

## The lens

Sort, filter, and page are one lens over one row store. Reading `view` applies them in a fixed
order — **filter, then sort, then page** — and that order is not configurable, because the other
orders answer a different question: sorting before filtering sorts rows nobody will see, and paging
before sorting pages the wrong rows onto every page.

### Sorting

The table holds at most one term per column and applies them in the order they were set. The first
term decides, and each later term breaks the tie the terms before it left. Rows no term separates
keep the order the table holds them in, so the sort is stable and the row store's own order is the
final tiebreak.

```ts
import { createTable } from '@orkestrel/table'

const table = createTable(
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

table.sort.set([
	{ column: 'team', direction: 'ascending' },
	{ column: 'age', direction: 'descending' },
])

table.view.map((row) => row.id) // ['1', '3', '2'] — team first, age breaking the tie
table.sort.order('age') // { column: 'age', direction: 'descending' }
```

There is no cycling verb. Which direction a heading offers next is the host's decision, so a host
reads the column's term, decides, and then calls `set` or `remove`. Setting a term for a column
already sorted replaces that column's direction **in place**, keeping its position in the list; every
other term joins the end.

`sortRows` is the same pass without a table, for a caller that has rows and terms and no entity. It
sorts a copy, so the list handed to it never moves.

```ts
import { sortRows } from '@orkestrel/table'
import type { TableSchema } from '@orkestrel/table'

const schema: TableSchema = {
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'number', key: 'age' },
	],
}
const rows = [{ id: '1', age: 40 }, { id: '2' }, { id: '3', age: 30 }]

sortRows(schema, rows, [{ column: 'age', direction: 'ascending' }]).map((row) => row.id)
// ['2', '3', '1'] — an absent cell sorts before every present one
sortRows(schema, rows, []).map((row) => row.id) // ['1', '2', '3'] — no term, no movement
rows.map((row) => row.id) // ['1', '2', '3'] — the input is untouched
```

### Filtering

The table holds at most one filter per column and keeps every row all of them accept. Composition is
**and** in this version: there is no either-or, and no nesting.

A filter names a column and carries only the operands its operator uses, so a `between` missing a
bound cannot be written down. An operator the column's cell does not admit raises `TableError` coded
`CELL`, and an operand the column cannot hold raises the same — a `contains` against a `number`
column and a `between` whose bounds are the wrong shape are both refusals, not empty results.

```ts
import { createTable, isTableError } from '@orkestrel/table'

const table = createTable(
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

table.filter.set([
	{ column: 'name', operator: 'contains', text: 'a' },
	{ column: 'age', operator: 'between', minimum: 40, maximum: 50 },
])

table.count // 1 — both filters, and only Grace satisfies both
table.view.map((row) => row.name) // ['Grace']

try {
	table.filter.set({ column: 'age', operator: 'contains', text: '4' })
} catch (error) {
	if (isTableError(error)) error.code // 'CELL' — `contains` has no meaning against a number
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

`filterRows` is the same pass without a table, and it keeps the order it was given.

```ts
import { filterRows } from '@orkestrel/table'
import type { TableSchema } from '@orkestrel/table'

const schema: TableSchema = {
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

const lower = filterRows(schema, rows, [{ column: 'name', operator: 'contains', text: 'a' }])
const upper = filterRows(schema, rows, [{ column: 'name', operator: 'contains', text: 'A' }])

lower.map((row) => row.name) // ['Ada', 'Grace']
upper.map((row) => row.name) // ['Ada'] — `contains` is case-sensitive
filterRows(schema, rows, []).length // 3 — no filter refuses nothing
```

### Pagination

`page` is the state, counted from one. `offset` and `count` are worked out from it and from the rows
the filter admits, so nothing here can drift out of step with what the table holds.

- `limit` is how many rows a page holds, or `undefined` when the table is not paged. An unpaged table
  reports `page` 1, `offset` 0, and `count` 1, and its `view` is every row the filter admits.
- `offset` counts the rows skipped, from zero, which is exactly what a database query asks for.
- `count` is `max(1, ceil(rows / limit))`, so a paged table whose filter admits no rows still
  reports one page, and that page's `view` is empty. There is no page zero, and a host drawing
  "page 1 of 1" over an empty list needs no separate case for it.
- A page beyond the last one clamps to the last one. Narrowing the filter therefore moves the page
  on its own, and moving to page 9 of 3 shows page 3 rather than nothing.
- `resize` keeps the first row the view was showing, so the page moves to wherever that row now
  falls. Resizing is a change of magnification, not a jump to the top.

```ts
import { createTable } from '@orkestrel/table'

const table = createTable(
	{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
	{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }], limit: 2 },
)

table.pagination.count // 3 — five rows, two to a page
table.pagination.move(9)
table.pagination.page // 3 — clamped to the last page
table.pagination.offset // 4
table.view.map((row) => row.id) // ['5']

table.pagination.resize()
table.pagination.limit // undefined — not paged
table.view.length // 5
```

This vocabulary is deliberately the one `@orkestrel/database` and `@orkestrel/relation` already use:
`ascending` and `descending` for direction, a zero-based `offset` that means rows skipped, and
`limit` for the page size. A host doing server-side paging reads `sort.orders()`,
`filter.filters()`, and `pagination.offset` and `pagination.limit`, and hands them to a query
untranslated. Nothing is imported from either package and nothing is re-exported: the compatibility
is in the words, so the two sides agree without either depending on the other.

### Selection and expansion

Both hold `TableKey` sets and nothing else, and both offer the same three verbs: `select` and
`expand` add, `clear` removes, and `toggle` turns one row around. Each takes no argument to mean
every row, one key to mean one row, and a key list to mean those rows, and a list is checked in full
before any of it moves.

Selecting with no argument picks **every row the table holds** — not every visible one. A host
offering a header checkbox that picks the page hands that page's keys over instead, which is one
line over `view` and keeps the ambiguity where the host can see it.

```ts
import { createTable } from '@orkestrel/table'

const table = createTable(
	{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
	{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }] },
)

table.selection.select(table.view.map((row) => String(row.id))) // the page, not the table
table.selection.keys.size // 3

table.selection.toggle('2')
table.selection.keys.has('2') // false

table.rows.remove('1')
table.selection.keys.has('1') // false — a row that leaves takes its key with it
```

What an opened row shows beside it is the host's to draw. Expansion says which rows are open and
stops there.

```ts
import { createTable } from '@orkestrel/table'

const table = createTable(
	{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
	{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }] },
)

table.expansion.expand() // no argument — every row the table holds
table.expansion.keys.size // 3

table.expansion.clear('2')
table.expansion.expand(['2', '9']) // false — '9' names no row, so neither one opened
table.expansion.keys.has('2') // false

table.expansion.toggle('2')
table.expansion.keys.size // 3
```

Both managers are the same algorithm over two sets, so it is written once. `computeKeys` takes the
keys a caller may address, the set as it stands, the 0/1/N argument, and a decision made per key
from that key's own membership. It returns `undefined` when any requested key is unknown, which is
the `false` those verbs report. It returns the set it was handed when nothing moved, which is how a
no-op stays silent. Otherwise it returns the next set. It is exported for the reason the managers
are: a host keeping a third key set of its own gets the same atomicity without writing it again.

```ts
import { computeKeys } from '@orkestrel/table'
import type { TableKey } from '@orkestrel/table'

const known: readonly TableKey[] = ['1', '2', '3']
const picked: ReadonlySet<TableKey> = new Set(['1'])

computeKeys(known, picked, '2', () => true)?.size // 2 — '2' joins '1'
computeKeys(known, picked, '9', () => true) // undefined — '9' is not a key the caller may address
computeKeys(known, picked, '1', () => true) === picked // true — nothing moved, so nothing is announced
computeKeys(known, picked, undefined, (included) => !included)?.size // 2 — every key turned around
```

## Lifecycle and state

A table is a live projection, not a document that settles. It has no terminal success state, no
submit, and no result: rows arrive and leave for as long as the host holds it, and every read
answers from what it holds at that moment.

Two verbs end things, and they end different things.

- **`clear` resets, and the table stays open.** Every row goes, and sort, filter, selection,
  expansion, and the page all reset to how the table opened. The schema and the options do not move.
  A cleared table takes rows again immediately.
- **`destroy` tears down, and the table stays readable.** Calling it twice does what calling it once
  did. Afterwards every write raises `TableError` coded `DESTROYED`, while every getter still answers
  what the table last held — so a host can read its way out of teardown without catching anything.

`destroyed` is the readable fact, and it exists so a host handed a `TableInterface` it did not
construct does not have to use an exception as control flow.

```ts
import { createTable, isTableError } from '@orkestrel/table'

const table = createTable(
	{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
	{ rows: [{ id: '1' }, { id: '2' }] },
)

table.clear()
table.count // 0
table.rows.add({ id: '3' }) // a cleared table is still open

table.destroy()
table.destroy() // idempotent
table.destroyed // true
table.count // 1 — every getter still answers

try {
	table.rows.add({ id: '4' })
} catch (error) {
	if (isTableError(error)) error.code // 'DESTROYED'
}
```

A write is every call that could change what the table holds: `rows.add`, `rows.update`,
`rows.move`, `rows.remove`, `sort.set`, `sort.remove`, `filter.set`, `filter.remove`,
`selection.select`, `selection.clear`, `selection.toggle`, `expansion.expand`, `expansion.clear`,
`expansion.toggle`, `pagination.move`, `pagination.resize`, and the table's own `clear`. Every one of
them raises `DESTROYED` after teardown. `destroy` itself does not.

## Events

Eight events, and each carries the fact that moved. No listener sees a state the table has not
finished writing. An event fires only when something actually moved: a write that changes nothing
announces nothing.

| Event      | Payload                     | Fires                                                                                                                                                                      |
| ---------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `write`    | the row's `key`             | Once per row admitted, written over, or moved to a different place, in the order the table wrote them. A listener that wants the row reads it back.                        |
| `remove`   | the row's `key`             | Once per row taken out, in the order the table removed them. A `clear` is the exception; see its row.                                                                      |
| `sort`     | every current `TableOrder`  | Whenever the term list's content changes, carrying the whole list as it now stands.                                                                                        |
| `filter`   | every current `TableFilter` | Whenever the filter list's content changes, carrying the whole list as it now stands.                                                                                      |
| `select`   | the picked `TableKey` set   | Whenever the picked set changes, carrying the whole set — including when removing rows pruned it.                                                                          |
| `expand`   | the opened `TableKey` set   | Whenever the opened set changes, carrying the whole set — including when removing rows pruned it.                                                                          |
| `paginate` | the `page` now shown        | Whenever the paged window moves: a `move`, a `resize`, and a clamp caused by a narrower filter or by rows leaving.                                                         |
| `clear`    | nothing                     | On a completed `clear`. It is the whole announcement of that reset: no `remove`, no `sort`, no `filter`, no `select`, no `expand`, and no `paginate` is emitted beside it. |

A payload is owned by the listener. `sort` and `filter` carry the whole axis because a single term is
unreadable without the rest, and `select` and `expand` carry the same `ReadonlySet` shape the
managers' `keys` getters publish — one concept, one shape, emitted as a copy so nothing a listener
holds moves underneath it.

One call can announce more than one thing, and the order is fixed: **the rows first, then the axes
they disturbed, in the order `select`, `expand`, `paginate`.** Removing two picked rows from a paged
table therefore emits `remove`, `remove`, `select`, and then `paginate` if the page had to clamp.

`TableOptions.rows` seeds quietly. Seeding announces nothing at all, so a table opens silent and
every later write is heard.

Wire listeners at construction through `TableOptions.on`, or afterwards through the `emitter`. Both
reach the same typed emitter, and a listener that throws is isolated and reported to
`TableOptions.error` rather than breaking its siblings or the table.

```ts
import { createTable } from '@orkestrel/table'

const seen: string[] = []

const table = createTable(
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

table.emitter.on('clear', () => seen.push('clear'))

table.rows.add({ id: '2', age: 45 })
table.sort.set({ column: 'age', direction: 'ascending' })
table.sort.set({ column: 'age', direction: 'ascending' }) // the same term twice
table.clear()

seen // ['write 2', 'sort 1', 'clear'] — the repeated term moved nothing and said nothing
```

## Wire safety

A schema is data, so it travels whole. It carries no function, nothing is dropped on the way, and
`serializeTable` and `parseTable` are the two ends of that trip.

```ts
import { parseTable, serializeTable } from '@orkestrel/table'
import type { TableSchema } from '@orkestrel/table'

const schema: TableSchema = {
	name: 'people',
	label: 'People',
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id', label: 'Reference' },
		{ cell: 'number', key: 'age', label: 'Age', meta: { align: 'right' } },
	],
}

const wire = JSON.stringify(serializeTable(schema))
const received = parseTable(JSON.parse(wire))

JSON.stringify(serializeTable(received ?? schema)) === wire // true
parseTable({ key: 'id', columns: 'not a list' }) // undefined
parseTable({ columns: [{ cell: 'text', key: 'id' }] }) // undefined — no `key`
```

The round trip is byte-stable because both projections fix the order they emit in: `serializeTable`
writes a schema's members in declaration order and a column's in the order the contract declares
them, and `serializeRows` writes each row's cells in the schema's column order. Ordering is what
turns "the same data" into "the same bytes", and it is the only reason a caller can compare two wire
forms with `===` instead of walking them.

That is canonicalization, not preservation. A projection reorders whatever it was handed: an object
written `columns` before `key` comes back with `key` before `columns`, because declaration order is
the order the contract declares and not the order the caller typed. So the bytes settle at the first
projection, and every projection after it — of that schema, or of what `parseTable` returned from
those bytes — reproduces them exactly. Compare two wire forms, never a wire form against arbitrary
incoming bytes.

Rows travel too, and they arrive as strings far more often than not — a query string, a form post, a
CSV cell. `parseRows` coerces exactly two things and nothing else: a numeric string into a `number`
for a `number` column, and `'true'` or `'false'` into a boolean for a `flag` column. Every other
value must already have its column's shape.

`parseRows` is strict in every other direction. It reads rows against the schema, so a key the
schema does not declare refuses the whole payload, a cell its column cannot hold refuses the whole
payload, and so does a row with no usable identity or an identity another row already used. A JSON
`null` is a cell no column can hold, and it is the refusal a wire producer meets most often: absence
here is an absent key, so a producer writing `null` for an empty field drops the key instead. There is
no partial result, because a half-accepted row set is worse than a rejected one — and the door where
identity is checked is this one, so nothing that reaches the table has to be checked for it twice.

```ts
import { parseRows, serializeRows } from '@orkestrel/table'
import type { TableSchema } from '@orkestrel/table'

const schema: TableSchema = {
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

**What never travels is everything that is not the document.** `TableOptions` does not: `on`,
`error`, `comparators`, and `matchers` are functions or hold them, and a function has no wire form.
Neither does live state — the sort terms, the filters, the picked and opened keys, and the page are
the lens a session is looking through, not the data it is looking at. A host that wants to persist a
lens reads `sort.orders()`, `filter.filters()`, `selection.keys`, and `pagination.page` and stores
them at its own door, in its own format. This package ships no parser for them, because it would be
a parser for the host's decision rather than for the table's document.

The guards are the same boundary read one value at a time, and every one of them is total.

```ts
import {
	isColumnCell,
	isColumnChoice,
	isTableCell,
	isTableColumn,
	isTableRow,
	isTableSchema,
} from '@orkestrel/table'

isColumnCell('choice') // true
isColumnCell('date') // false — a date is `text` holding an ISO string
isTableCell(36) // true
isTableCell(null) // false — absence is an absent key, never null
isTableRow({ id: '1', age: 36 }) // true
isTableRow({ id: ['1'] }) // false
isColumnChoice({ value: 'a', label: 'A' }) // true
isColumnChoice({ value: 'a', label: 'A', colour: 'red' }) // false — an unknown member refuses it
isTableColumn({ cell: 'choice', key: 'status', choices: [] }) // true — structure only
isTableSchema({ key: 'id', columns: [{ cell: 'text', key: 'id' }] }) // true
isTableSchema({ columns: [] }) // false — `key` is required
```

The two schema guards are where the boundary is drawn twice, because a schema can be the right shape
and still be a table nobody could open. `isStructuralTableSchema` answers the shape;
`isTableSchema` answers the shape and the audit together, and it is the single-call guard consumers
and parsers read. The constructor reads `isStructuralTableSchema` and runs `auditTable` once so its
`SCHEMA` message retains the diagnostics.

```ts
import { isStructuralTableSchema, isTableSchema, parseTable } from '@orkestrel/table'

const unsound = { key: 'missing', columns: [{ cell: 'text', key: 'id' }] }

isStructuralTableSchema(unsound) // true — every member is present and typed
isTableSchema(unsound) // false — `key` names no declared column
parseTable(unsound) // undefined — the parser refuses exactly what the guard refuses
isStructuralTableSchema({ columns: [] }) // false — `key` is required by the shape itself
```

### Owning what arrives

The cloners are how a value stops being the caller's. The table clones the schema at construction and
every row at admission, and it clones every row it hands back. They are exported because a consumer
building its own row store needs the same guarantee.

```ts
import { cloneRow, cloneSchema } from '@orkestrel/table'

const row = { id: '1', age: 36 }
const owned = cloneRow(row)

owned === row // false
Object.isFrozen(owned) // true

Object.isFrozen(cloneSchema({ key: 'id', columns: [{ cell: 'text', key: 'id' }] })) // true
```

### Budgets

Six budgets bound how much a schema can be, so a document that arrives from a wire cannot cost
unbounded memory or unbounded scanning before anything decides to trust it. Every one is exported, so
a host can check against the same number the package checks against.

| Constant       | Value   | Unit                    | Bounds                                    |
| -------------- | ------- | ----------------------- | ----------------------------------------- |
| `COLUMN_LIMIT` | 256     | columns                 | One schema's `columns`                    |
| `CHOICE_LIMIT` | 1024    | choices                 | One `choice` column's list                |
| `NAME_LIMIT`   | 128     | UTF-16 code units       | Each schema name and column key           |
| `STRING_LIMIT` | 65536   | UTF-16 code units       | Any one retained string                   |
| `TEXT_LIMIT`   | 1048576 | UTF-16 code units       | Every string one schema retains, together |
| `NODE_LIMIT`   | 16384   | records, arrays, leaves | Everything one schema retains, together   |

They bind at two doors, and which door a limit sits at is the whole story.

**The schema door reports.** `auditTable` counts columns, choices, names, strings, total text, and
total nodes — `meta` included, since it is retained like everything else — and returns one human
diagnostic per breach. `createTable` raises `SCHEMA` carrying them and `parseTable` refuses the
schema, so no over-budget schema is ever held.

**The value door refuses.** `matchesCell` checks `STRING_LIMIT` on any string before it consults the
column, so an over-long cell is refused before anything else looks at it. `rows.add`, `rows.update`,
and a seeded row raise `CELL`; `parseRows` returns `undefined`.

`STRING_LIMIT` is the one that stands at both, so no string this package retains is longer than
65536 code units whichever way it arrived.

The two whole-schema ceilings are what make the arithmetic safe. Whatever the per-item limits admit,
one audited schema retains at most 1048576 string code units and at most 16384 nodes, so the worst
case is those two numbers rather than the product of the others.

Two things stay unbounded, each for its own reason. **Rows are not budgeted**: a table legitimately
holds a million of them, and a ceiling here would be product policy wearing a constant's name. And
the structural **read** at the parse door is not bounded either — `parseTable` copies and guards
every column that arrived before the audit sees one of them, so a payload four times over
`COLUMN_LIMIT` is read four times over and then refused. Bound the size of a payload at the transport
that delivers it, which is the only layer holding the bytes.

### Auditing a schema

`auditTable` is the semantic pass beyond structural validation. It reports seven domain faults
and every budget breach above — six the shape alone cannot see, and one, an unownable `meta`,
that the structural guard also refuses so the three doors stay in agreement:

- `key` names no declared column.
- `key` names a `number` or `flag` column, whose cells can never hold a string identity.
- A column key is declared more than once.
- A column key is empty.
- A `choice` column offers the same value more than once.
- A `choice` column offers no choice at all, so it is a column no cell could ever fill.
- A column's `meta` cannot be owned as exact JSON.

The audit runs inside `createTable` and inside `parseTable`, so a consumer rarely calls it directly —
but it is exported, because a schema editor wants the diagnostics before it constructs anything.
`isTableSchema` is this list's emptiness over a structurally exact value, and nothing else, so the
guard, the constructor, and the parser cannot disagree about which schemas a table can be opened
against. The guard is the yes-or-no; the audit is why.

**It returns human diagnostics, not a machine contract.** Read them, show them, log them. Do not
branch on their text or parse a column key out of them: the wording is free to change with the
diagnostics, and only the emptiness of the list is a promise. It returns a string list rather than a
`Result` for exactly that reason — a `Result` would dress a diagnostic list as an outcome and invite
a consumer to treat one as the other. Where a machine outcome is what you need, use the guards, or
use `parseTable` and read `undefined`.

```ts
import { auditTable } from '@orkestrel/table'

auditTable({ key: 'ref', columns: [{ cell: 'text', key: 'id' }] })
// ['schema key "ref" names no declared column']
auditTable({ key: 'age', columns: [{ cell: 'number', key: 'age' }] })
// ['schema key "age" names a number column, which holds no identity']
auditTable({
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'text', key: 'id' },
	],
})
// ['column "id" is declared more than once']
auditTable({ key: 'id', columns: [{ cell: 'text', key: 'id' }] }) // []
```

## Methods

The public methods of the seven behavioral interfaces, which the seven classes implement exactly and
add nothing to. Every readonly data member stays in the `## Surface` rows above and is not repeated
here: `TableInterface`'s `emitter`, `schema`, six managers, `view`, `count`, and `destroyed`;
`SelectionManagerInterface.keys` and `ExpansionManagerInterface.keys`; and
`PaginationManagerInterface`'s `page`, `limit`, `offset`, and `count`.

Every other row in the Surface tables is a data shape, a union, a constant, a function, or an error
class, so none of them carries a method table. `CellComparator` and `CellMatcher` are callable
function types with one call signature and no named members.

Where a method takes no argument, one key, or a key list, that is one method with three overloads
rather than three methods. A list is checked in full before any of it moves, and the call returns
`true` only when every name in it names what its manager addresses: a row the table holds for
`rows`, `selection`, and `expansion`, and a column the schema declares for `sort` and `filter`. So
`selection.clear('9')` is `false` for a key no row carries, while `sort.remove('age')` is `true` for
a declared `age` column nothing was sorting by — the column exists, and afterwards nothing sorts by
it either way.

#### `TableInterface`

| Method    | Returns | Behavior                                                                                                                 |
| --------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `clear`   | `void`  | Put the table back the way it opened, holding nothing. Rows, sort, filter, selection, expansion, and the page all reset. |
| `destroy` | `void`  | Tear the table down. Idempotent; afterwards every write raises `DESTROYED` and every getter still answers.               |

#### `RowManagerInterface`

| Method   | Returns                   | Behavior                                                                                                           |
| -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `row`    | `TableRow` or `undefined` | Find one row by key; `undefined` when the table holds no such key.                                                 |
| `rows`   | `readonly TableRow[]`     | Every row the table holds, in its own order — unfiltered, unsorted, and unpaged.                                   |
| `add`    | `void`                    | Take in one row or several, appending them in the order given. Every row is checked before any is admitted.        |
| `update` | `boolean`                 | Write over one row or several, each found by the key it carries. The cells given replace; the cells left out stay. |
| `move`   | `boolean`                 | Move one row to another place in the table's own order, counted from zero and clamped to the rows that exist.      |
| `remove` | `void` or `boolean`       | Take out every row, one row, or several. Selection and expansion drop the keys of the rows that went.              |

#### `SortManagerInterface`

| Method   | Returns                     | Behavior                                                                                                                                                      |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order`  | `TableOrder` or `undefined` | Find one column's term; `undefined` when nothing sorts that column.                                                                                           |
| `orders` | `readonly TableOrder[]`     | Every term the table sorts by, first to last, in the order they decide.                                                                                       |
| `set`    | `void`                      | Sort by one column or several. A term for a column already sorted replaces its direction in place; others join the end. An undeclared column raises `COLUMN`. |
| `remove` | `void` or `boolean`         | Stop sorting by everything, by one column, or by several. An undeclared column returns `false` and stops nothing.                                             |

#### `FilterManagerInterface`

| Method    | Returns                      | Behavior                                                                                                                                                                                           |
| --------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filter`  | `TableFilter` or `undefined` | Find one column's filter; `undefined` when nothing filters that column.                                                                                                                            |
| `filters` | `readonly TableFilter[]`     | Every filter the table keeps rows by, in the order they were set.                                                                                                                                  |
| `set`     | `void`                       | Filter one column or several. A filter for a column already filtered replaces it; others join the end. An undeclared column raises `COLUMN`, and a filter the column does not admit raises `CELL`. |
| `remove`  | `void` or `boolean`          | Stop filtering everything, one column, or several. An undeclared column returns `false` and stops nothing.                                                                                         |

#### `SelectionManagerInterface`

| Method   | Returns             | Behavior                                                                                         |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `select` | `void` or `boolean` | Pick every row the table holds, one row, or several. Every row, not every visible one.           |
| `clear`  | `void` or `boolean` | Drop every pick, one pick, or several. A known key that was not picked still answers `true`.     |
| `toggle` | `boolean`           | Pick one row or drop it when it is already picked; over a list, turn each row around on its own. |

#### `ExpansionManagerInterface`

| Method   | Returns             | Behavior                                                                                        |
| -------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `expand` | `void` or `boolean` | Open every row the table holds, one row, or several.                                            |
| `clear`  | `void` or `boolean` | Close every row, one row, or several. A known key that was not open still answers `true`.       |
| `toggle` | `boolean`           | Open one row or close it when it is already open; over a list, turn each row around on its own. |

#### `PaginationManagerInterface`

| Method   | Returns | Behavior                                                                                                           |
| -------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `move`   | `void`  | Show another page, counted from one and clamped to the pages that exist.                                           |
| `resize` | `void`  | Say how many rows a page holds, keeping the first row the view was showing. Leave the argument out to stop paging. |

### Errors

`TableError` carries a machine-readable `code` and an optional structured `context`. Narrow a caught
value with `isTableError` and branch on `code`; never match on message text.

| Code        | Raised when                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCHEMA`    | The schema is not a table schema, or `auditTable` found a domain fault or a budget breach — `createTable` and the `Table` constructor raise those. `serializeTable` and `cloneSchema` raise it at their own door for a `meta` no clone can own, which the guard and the audit refuse first. |
| `COLUMN`    | A term or a filter names a column the schema does not declare.                                                                                                                                                                                                                              |
| `KEY`       | A row's identity is missing, unusable, already taken, or repeated inside one batch.                                                                                                                                                                                                         |
| `CELL`      | A cell is one its column cannot hold, or a filter's operator or operand is one its column cannot take.                                                                                                                                                                                      |
| `DESTROYED` | A write reached a table that has been torn down.                                                                                                                                                                                                                                            |

```ts
import { createTable, isTableError } from '@orkestrel/table'

try {
	createTable({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] })
} catch (error) {
	if (isTableError(error)) error.code // 'SCHEMA'
}

const table = createTable({
	key: 'id',
	columns: [
		{ cell: 'text', key: 'id' },
		{ cell: 'number', key: 'age' },
	],
})

try {
	table.sort.set({ column: 'nope', direction: 'ascending' })
} catch (error) {
	if (isTableError(error)) error.code // 'COLUMN'
}

try {
	table.rows.add({ id: '1', age: 'twelve' })
} catch (error) {
	if (isTableError(error)) error.code // 'CELL'
}

table.rows.rows().length // 0 — a refused write changed nothing
```

`createTable` and `new Table(...)` are the same construction. Prefer the factory at a call site that
only needs `TableInterface`; reach for the class where a class holds a table as its own field and
wants the concrete type.

```ts
import { Table } from '@orkestrel/table'

const table = new Table(
	{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
	{ rows: [{ id: '1' }] },
)

table.count // 1
```

## Contract

These invariants hold across [`src/core`](../src/core) and this guide.

1. **Documented surface equals exported surface.** Every row in the `## Surface` tables is a real
   barrel export of `src/core`, and every barrel export is a row — both directions, exhaustively.
   Nothing in this module is internal, so the parity suite's internal list is empty.
2. **Documented methods equal interface methods.** Each `## Methods` table lists exactly its
   interface's call-signature members, and each class implements every one and adds no public
   behavior beyond them. Seven interfaces, seven tables, seven classes.
3. **Identity is a declared column's non-empty string cell.** `TableSchema.key` is required and must
   name a declared column. A row whose cell there is missing, empty, or not a string is refused with
   `KEY`, and so is a key the table already holds or a key repeated inside one batch. There is no
   default column, no positional fallback, and no key generation anywhere in this package.
4. **A row is owned at admission and at every read.** The table clones and freezes each row it
   admits and each row it hands back, and clones and freezes the schema at construction. An edit to
   the object a caller passed changes nothing inside the table, and no getter returns a live internal
   reference.
5. **A write is all-or-nothing, and it refuses one of two ways.** `rows.add`, `rows.update`,
   `rows.remove`, `sort.set`, `sort.remove`, `filter.set`, `filter.remove`, and every 0/1/N verb on
   selection and expansion check the whole argument before any of it lands. A bad value raises
   `KEY`, `CELL`, or `COLUMN`. A name that nothing answers to returns `false` and raises nothing —
   an unheld row key for `rows`, `selection`, and `expansion`, and an undeclared column for
   `sort.remove` and `filter.remove`. Either way the table is left exactly as it was.
6. **`update` merges and cannot move a key.** The cells given replace the cells held and the cells
   left out stay as they are, and the row is found by the key it carries — so no sequence of
   `update` calls changes any row's identity.
7. **The view is derived, never stored.** `view`, `count`, `pagination.offset`, and
   `pagination.count` are worked out on every read from the rows, the filters, the terms, and
   `page`. Nothing caches them, so none of them can disagree with what the table holds.
8. **The lens applies in one order.** `view` is filtered, then sorted, then paged, always. A filter
   therefore decides `count` and the page count, and paging never reorders anything.
9. **Sorting is stable and its terms are ordered.** The first term decides and each later term
   breaks the tie the ones before it left; rows no term separates keep the row store's own order.
   Setting a term for an already-sorted column replaces its direction in place and does not move it
   in the list. A `choice` column compares by the order its `choices` declares, a `flag` compares
   false before true, a `number` by magnitude, and a `text` lexically. An absent cell sorts before
   every present one in ascending order.
10. **Filters are and-only, one per column.** The table holds at most one filter per column and
    keeps the rows every one of them accepts. There is no either-or composition and no nesting. An
    operator its column's cell does not admit, and an operand its column cannot hold, are both `CELL`
    refusals rather than empty results.
11. **An override replaces one column's default and nothing else.** A `comparators` or `matchers`
    entry is consulted only for the column its key names, receives `undefined` for a row carrying no
    cell there, and never changes which columns exist. A comparator always describes ascending order
    and `TableDirection` is applied to its result. An entry naming an undeclared column is never
    consulted and is not an error.
12. **Selection and expansion hold keys, and prune.** Both hold `TableKey` sets only, so a pick
    survives a sort, a filter, and a page turn; and a row leaving the table removes its key from
    both. Selecting with no argument picks every row the table holds, not every row in `view`.
13. **Pagination is derived and clamps.** `page` is the only stored fact, counted from one;
    `offset` is `(page - 1) * limit` and zero when unpaged; `count` is `max(1, ceil(rows / limit))`
    and `1` when unpaged — so a paged table with no admitted rows holds one page, and that page's
    `view` is empty. A page beyond the last clamps to the last, including when a filter or a removal
    shrinks the rows underneath it. `resize` keeps the first row the view was showing.
14. **Every event fires after commit, and a no-op is silent.** No listener sees a state the table has
    not finished writing, and a call that moves nothing announces nothing — the same sort term twice,
    a toggle back to where it was, a `move` to the index a row already occupies. When one call moves
    several things, the rows announce first and then the axes they disturbed, in the order `select`,
    `expand`, `paginate`. Seeded rows announce nothing at all.
15. **`clear` is one announcement and `destroy` is idempotent.** `clear` emits `clear` alone,
    whatever it reset, so a reset of ten thousand rows is one event. `destroy` called twice does what
    calling it once did; afterwards every write raises `DESTROYED` while every getter still answers
    what the table last held, and `destroyed` reports the fact so a host need not catch to learn it.
16. **Guards are total and parsers refuse.** No `is*` throws for any input — hostile prototype,
    symbol key, cycle, or depth. No `parse*` throws; each returns `undefined` on refusal. A
    guard-valid value is never refused by its parser, and every parsed result satisfies its guard.
    `isTableSchema` is therefore semantic and not merely structural: it is the exact shape plus an
    empty `auditTable`, which is exactly what `parseTable` and the `Table` constructor demand.
    `isStructuralTableSchema` is the shape alone, for a caller running the audit itself.
17. **Only data crosses the wire, and the round trip is byte-stable.** `serializeTable` and
    `serializeRows` emit in canonical order — a schema's members in declaration order, a column's in
    the order the contract declares them, and a row's cells in the schema's column order. Incoming
    key order is canonicalized rather than preserved, so the bytes settle at the first projection
    and every projection after it reproduces them, including a projection of what `parseTable` or
    `parseRows` returned from those bytes. `meta` survives verbatim key for key. Options and live
    state have no projection at all: functions, sort terms, filters, picked keys, opened keys, and
    the page never travel.
18. **Identity is checked at the parse door.** `parseRows` refuses the whole payload when a row has
    no usable identity, when two rows share one, when a cell's column cannot hold it, or when a key
    names no declared column. It coerces exactly two things — a numeric string for a `number` column
    and `'true'` / `'false'` for a `flag` column — and nothing else.
19. **Every retained size is budgeted.** `auditTable` reports a breach of `COLUMN_LIMIT`,
    `CHOICE_LIMIT`, `NAME_LIMIT`, `STRING_LIMIT`, `TEXT_LIMIT`, or `NODE_LIMIT`, so `createTable`
    raises `SCHEMA` and `parseTable` refuses; `matchesCell` refuses a string breaching
    `STRING_LIMIT` before it consults the column, so a write raises `CELL` and `parseRows` returns
    `undefined`. `TEXT_LIMIT` and `NODE_LIMIT` are whole-schema ceilings, `meta` included, so the
    per-item limits never multiply. Row count is deliberately unbudgeted, and so is the structural
    read at the parse door, which is the transport's to bound.
20. **`auditTable` returns diagnostics, not a contract.** The list's emptiness is the promise. The
    wording of its strings is not, and no consumer should parse them.
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
| Rendering                    | host          | The table owns values, not pixels. It names no host type, so one table serves a browser, a terminal, a report, and an export equally — and the moment it drew one of them it would serve only that one.                                                                                                                                                                                                                       |
| ARIA and roles               | host          | `label` and `help` are the strings an accessible grid needs. The roles, the ids, and their uniqueness belong to the layer that owns the elements.                                                                                                                                                                                                                                                                             |
| Keyboard and focus           | host          | Arrow keys, roving focus, and type-ahead are input gestures over drawn cells. The table has no cursor because it has no cells on a screen.                                                                                                                                                                                                                                                                                    |
| Virtualization               | host          | Which rows are cheap to draw is a measurement of drawn things. `pagination` already gives a windowing host `offset` and `limit`, and a virtualizer that wants the whole list leaves the table unpaged and reads `view`, which is every admitted row in sort order. `rows()` is the store's own order and ignores the lens.                                                                                                    |
| Column resizing              | host          | A width is pixels. `meta` carries one when a host must ship it in the schema, and the table never reads it.                                                                                                                                                                                                                                                                                                                   |
| Column reordering and hiding | seam          | `columns` order is presentation order and `hidden` is the flag. Reordering is building the next schema, which is one line over the array a host already holds.                                                                                                                                                                                                                                                                |
| Row drag-and-drop            | seam          | The gesture is the host's; the result is `rows.move(key, index)`, which is the one verb that writes the table's own order.                                                                                                                                                                                                                                                                                                    |
| Sticky columns and headers   | host          | Which columns stay put while the rest scroll is a layout decision about drawn elements.                                                                                                                                                                                                                                                                                                                                       |
| Or-filters and nested groups | out           | v1 composes filters with **and** only, one per column, which is what a filter bar produces. The one thing it cannot express at all is the global search box that matches a term against every column: that is an or across columns, and a host wanting one narrows `rows()` with its own predicate and holds the result itself. Either-or turns a flat list into a tree and takes every guard, parser, and wire form with it. |
| Grouping and aggregation     | out           | Group headers, subtotals, and rollups add a second row kind that is not a row, and a fold that is not a filter. `view` stays a flat list of the rows the table holds.                                                                                                                                                                                                                                                         |
| Tree and hierarchical rows   | out           | A parent key would make `view` a traversal rather than a projection, and expansion would mean "show children" instead of "this row is open". Expansion here says only which rows are open.                                                                                                                                                                                                                                    |
| Editing transactions         | out           | A staged edit set with commit and rollback is a second store beside the row store, and two writers that can disagree. A host that needs one holds the pending values and calls `update` once.                                                                                                                                                                                                                                 |
| Undo and history             | out           | The table holds the rows now. A stack of everything before is a host concern with a host's retention policy, built over the same `update` and `remove` calls.                                                                                                                                                                                                                                                                 |
| Async data sources           | host          | Every read here is synchronous, so `view` is right the instant anything moves. Fetching, paging a server, and reconciling a response are the host's; it reads the lens and calls `add` or `clear`.                                                                                                                                                                                                                            |
| Server-side paging           | seam          | `sort.orders()`, `filter.filters()`, `pagination.offset`, and `pagination.limit` are already the shape a query asks for, in the vocabulary `@orkestrel/database` uses.                                                                                                                                                                                                                                                        |
| Row count budget             | out           | A table legitimately holds a million rows. The budgets bound one schema's declarations, which arrive from a wire; how many rows a host holds is the host's memory to spend.                                                                                                                                                                                                                                                   |
| Parsing a lens off the wire  | out           | Sort terms, filters, and the picked keys are what a session is looking through, not the document. A host persisting them owns the format, so a parser here would parse the host's decision.                                                                                                                                                                                                                                   |
| Case folding and collation   | seam          | `contains` compares case-sensitively and `text` compares with the language's own string order. Locale is a decision this package cannot make for a host, so a `CellMatcher` or `CellComparator` makes it.                                                                                                                                                                                                                     |
| A temporal cell              | out           | ISO text written to one canonical spelling per instant — one offset, one precision, and no alternate spelling of a given date or time — sorts chronologically already, so a temporal cell would add a variant that behaves exactly like `text` and a calendar to go with it. Normalizing to that one canonical representation is the host's, and a `CellComparator` covers a column that arrives mixed.                       |
| Calendar validity            | host          | `'2026-02-31'` is lexically fine and not a real day. A date control refuses it before it arrives, and a domain that needs the check adds it at its own door.                                                                                                                                                                                                                                                                  |
| Number and date formatting   | host          | A `number` cell is a number and a date is its ISO string. Turning either into what a person reads is locale work at the point of drawing, and `meta` carries the hint when a schema must ship one.                                                                                                                                                                                                                            |
| CSV and spreadsheet export   | host          | `view` or `rows()` plus `schema.columns` is the whole input an exporter needs, and the file format, encoding, and download belong to the host that has a filesystem or a browser.                                                                                                                                                                                                                                             |
| Cell-level selection         | out           | Selection holds row keys. A rectangular cell range is a second selection model with its own vocabulary, and no consumer has asked for one.                                                                                                                                                                                                                                                                                    |
| Choice `meta`                | out           | `meta` is on `ColumnBase` alone, because a column carrier is what the first consumer asked for. The exact guard refuses it on `ColumnChoice` until one asks.                                                                                                                                                                                                                                                                  |
| Browser binding              | `src/browser` | Binding a table to real elements — a grid, its headings, its scroll container — belongs in a future `src/browser`, taking a table and an element. Nothing renders in this round.                                                                                                                                                                                                                                              |

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ barrel bijection, the seven
  interface ↔ class method bijections, and the worked examples above executed against the real
  source so a documented value that the code contradicts fails.
- [`tests/src/core/Table.test.ts`](../tests/src/core/Table.test.ts) — construction, seeding, the
  derived `view` and `count`, emission order, `clear`, `destroy`, and writes after teardown.
- [`tests/src/core/tables/RowManager.test.ts`](../tests/src/core/tables/RowManager.test.ts) —
  `row`, `rows`, `add`, `update`, `move`, `remove`, batch atomicity, and identity refusals.
- [`tests/src/core/tables/SortManager.test.ts`](../tests/src/core/tables/SortManager.test.ts) —
  `order`, `orders`, `set`, `remove`, in-place replacement, stability, and comparator overrides.
- [`tests/src/core/tables/FilterManager.test.ts`](../tests/src/core/tables/FilterManager.test.ts) —
  `filter`, `filters`, `set`, `remove`, and-composition, operator refusals, and matcher overrides.
- [`tests/src/core/tables/SelectionManager.test.ts`](../tests/src/core/tables/SelectionManager.test.ts)
  — `select`, `clear`, `toggle`, the 0/1/N overloads, and pruning on removal.
- [`tests/src/core/tables/ExpansionManager.test.ts`](../tests/src/core/tables/ExpansionManager.test.ts)
  — `expand`, `clear`, `toggle`, the 0/1/N overloads, and pruning on removal.
- [`tests/src/core/tables/PaginationManager.test.ts`](../tests/src/core/tables/PaginationManager.test.ts)
  — `page`, `limit`, `offset`, `count`, `move`, `resize`, clamping, and the unpaged table.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — `extractColumn`,
  `extractKey`, `computeKeys`, `matchesCell`, `compareCells`, `admitsFilter`, `matchesFilter`,
  `filterRows`, `sortRows`, `auditTable`, `serializeTable`, `serializeRows`, and the budgets.
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — every guard against
  valid, off-shape, and hostile input, plus guard/parser soundness in both directions.
- [`tests/src/core/parsers.test.ts`](../tests/src/core/parsers.test.ts) — `parseTable`, `parseRows`,
  the two coercions, identity at the parse door, and the canonical byte-stable round trip.
- [`tests/src/core/cloners.test.ts`](../tests/src/core/cloners.test.ts) — every clone is owned,
  frozen, and deep enough that no caller reference survives.
- [`tests/src/core/constants.test.ts`](../tests/src/core/constants.test.ts) — the cell registry and
  each budget's value and unit.
- [`tests/src/core/errors.test.ts`](../tests/src/core/errors.test.ts) — `TableError`'s `code` and
  `context`, and `isTableError` narrowing.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — `createTable` returns
  a working `TableInterface`.
- [`tests/src/core/index.test.ts`](../tests/src/core/index.test.ts) — the barrel resolves every
  documented export.

## See also

- [`AGENTS.md`](../AGENTS.md) — the coding contract this package is written against.
- [`README.md`](README.md) — the guides index.
