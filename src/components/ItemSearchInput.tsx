import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InventoryOption {
  id: string;
  item_code: string;
  item_name: string;
  quantity: number;
  pallet_id: string | null;
}

interface ItemSearchInputProps {
  value: string;
  inventory: InventoryOption[];
  remainingFor: (id: string) => number;
  onSelect: (id: string) => void;
  /** Called after a keyboard selection, so the caller can move focus on. */
  onCommit?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}

/**
 * Type-ahead item picker. Fully keyboard driven — when every order in a batch
 * has different contents, reaching for the mouse per line is the bottleneck:
 * type, arrow to the item, Enter, and the caller moves focus to the quantity.
 */
export default function ItemSearchInput({
  value,
  inventory,
  remainingFor,
  onSelect,
  onCommit,
  autoFocus,
  placeholder = "Search item...",
}: ItemSearchInputProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const label = (item: InventoryOption) =>
    `${item.item_name} (${item.item_code})`;

  // Keep the input text in sync with the selected item
  useEffect(() => {
    const selected = inventory.find((item) => item.id === value);
    setSearch(selected ? label(selected) : "");
  }, [value, inventory]);

  const query = search.toLowerCase();
  const selected = inventory.find((item) => item.id === value);
  // Once an item is chosen the box shows its full label; don't filter it down
  // to that one row when the list is reopened
  const filtered =
    selected && search === label(selected)
      ? inventory
      : inventory.filter(
          (item) =>
            item.item_name?.toLowerCase().includes(query) ||
            item.item_code?.toLowerCase().includes(query)
        );

  useEffect(() => {
    setHighlight(0);
  }, [search]);

  // Keep the highlighted row in view while arrowing through a long list
  useEffect(() => {
    const row = listRef.current?.children[highlight] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const choose = (item: InventoryOption) => {
    onSelect(item.id);
    setSearch(label(item));
    setOpen(false);
    onCommit?.();
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) {
          setOpen(false);
          setSearch(selected ? label(selected) : "");
        }
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={search}
        className="pl-9"
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
        }}
        onFocus={(event) => {
          setOpen(true);
          event.target.select();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) => {
              const next = event.key === "ArrowDown" ? current + 1 : current - 1;
              if (filtered.length === 0) return 0;
              return (next + filtered.length) % filtered.length;
            });
          } else if (event.key === "Enter") {
            event.preventDefault();
            const item = filtered[highlight];
            if (item) choose(item);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md"
        >
          {filtered.length > 0 ? (
            filtered.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
                  index === highlight ? "bg-accent" : "hover:bg-accent"
                )}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{item.item_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {item.item_code}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  Available: {remainingFor(item.id)}
                </span>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matching items
            </div>
          )}
        </div>
      )}
    </div>
  );
}
