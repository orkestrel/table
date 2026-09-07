# @orkestrel/table

> The environment-agnostic tabular document: a `TableSchema` declaring the columns, a `Table`
> holding the rows given against it, and one lens of sort, filter, and page deciding which of them
> the view shows.

Open a table with the `createTable` function, seed or add its rows through `table.rows`, and read
`table.view` for the rows to draw. Every row carries its own identity in a column the schema names,
so a pick survives a re-sort, and budgets bound what one schema may retain, so a document that
arrives from a wire costs a known maximum before anything decides to trust it. Built on
`@orkestrel/contract` and `@orkestrel/emitter`, and part of the `@orkestrel` line.

## Install

```sh
npm install @orkestrel/table
```

## Requirements

- Node.js >= 22.12
- Host-independent: no `node:*`, no DOM. Ships dual ESM+CJS builds.

## Usage

Declare the columns, hold the rows, and read the ones to draw:

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
			{
				cell: 'choice',
				key: 'status',
				label: 'Status',
				choices: [
					{ value: 'draft', label: 'Draft' },
					{ value: 'live', label: 'Live' },
				],
			},
		],
	},
	{
		rows: [
			{ id: '1', name: 'Ada', age: 36, status: 'live' },
			{ id: '2', name: 'Grace', age: 45, status: 'draft' },
			{ id: '3', name: 'Alan', age: 41, status: 'live' },
		],
		limit: 2,
		on: { select: (keys) => console.log(keys.size, 'picked') },
	},
)

table.filter.set({ column: 'status', operator: 'equals', value: 'live' })
table.sort.set({ column: 'age', direction: 'descending' })

table.count // 2 — the rows the filter admits
table.view.map((row) => row.name) // ['Alan', 'Ada']

table.selection.toggle('1')
table.selection.keys.has('1') // true — a key, so it survives the next sort
```

## Guide

See [guides/table.md](./guides/table.md) for the documented surface — the column cells and what
each one fixes, the required identity column and the refusals built on it, the lens of sort, filter,
and page and the order it applies in, the events and when each one stays silent, the serialize/parse
wire boundary and what never crosses it, the budgets that bound a schema, and the concept inventory
of what this package leaves to the layer above.

## Package

Published as one entry point per the `exports` field in `package.json`: `.`, the host-independent
core. It ships dual ESM+CJS builds with declarations for both.

## Development

```sh
npm install
npm test
```

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
