import { useState } from 'react'

interface VariableSelectorProps {
  fields: string[]
  onSelect: (field: string) => void
}

export function VariableSelector({ fields, onSelect }: VariableSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const filtered = fields.filter((field) => field.toLowerCase().includes(search.toLowerCase()))

  const select = (field: string) => {
    onSelect(field)
    setOpen(false)
    setSearch('')
    setActiveIndex(0)
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="template-variable-list"
        onClick={() => {
          setOpen(!open)
          setSearch('')
          setActiveIndex(0)
        }}
        className="px-3 py-2 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Insert field ▾
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-10 p-2">
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-label="Search fields"
            aria-expanded={open}
            aria-controls="template-variable-list"
            aria-autocomplete="list"
            aria-activedescendant={filtered[activeIndex] ? `variable-${filtered[activeIndex]}` : undefined}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setOpen(false)
                event.currentTarget.closest('.relative')?.querySelector('button')?.focus()
              } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const next = Math.max(
                  0,
                  Math.min(filtered.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1))
                )
                setActiveIndex(next)
                document.getElementById(`variable-${filtered[next]}`)?.scrollIntoView?.({ block: 'nearest' })
              } else if (event.key === 'Enter') {
                event.preventDefault()
                if (filtered[activeIndex]) select(filtered[activeIndex])
              }
            }}
            placeholder="Search fields…"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <ul
            id="template-variable-list"
            role="listbox"
            aria-label="Template fields"
            className="mt-2 max-h-48 overflow-y-auto"
          >
            {filtered.map((field, index) => (
              <li
                key={field}
                id={`variable-${field}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(field)}
                className={`px-3 py-2 text-sm cursor-pointer rounded hover:bg-blue-100 ${index === activeIndex ? 'bg-blue-50 text-blue-800' : 'text-gray-700'}`}
              >
                {`{${field}}`}
              </li>
            ))}
          </ul>
          {filtered.length === 0 && (
            <p role="status" className="px-3 py-2 text-sm text-gray-500">
              No fields found
            </p>
          )}
        </div>
      )}
    </div>
  )
}
