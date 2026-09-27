import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ItemSearchInput, {
  type InventoryOption,
} from "@/components/ItemSearchInput";
import Spinner from "@/components/Spinner";
import { createOrder } from "@/lib/createOrder";
import { LABEL_ACCEPT, removeLabel, uploadLabel } from "@/lib/labels";
import { labelThumbnail, type LabelPreview } from "@/lib/labelPreview";
import {
  batchUsage,
  overdrawnItems,
  remainingStock,
} from "@/lib/batchStock";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileUp,
  FolderUp,
  Plus,
  Trash2,
  X,
} from "lucide-react";

interface LabelRow {
  id: string;
  file: File;
  preview: LabelPreview | null;
  previewLoading: boolean;
  items: {
    inventory_item_id: string;
    quantity: number;
    item_name: string;
    pallet_id: string | null;
  }[];
  category: string;
}

interface BulkLabelWizardProps {
  customerId: string;
  /** Admins price orders later; the customer never sees rates. */
  adminMode?: boolean;
  onComplete: () => void;
}

const emptyItem = () => ({
  inventory_item_id: "",
  quantity: 1,
  item_name: "",
  pallet_id: null as string | null,
});

const isLabelFile = (file: File) => /\.(pdf|png|jpe?g)$/i.test(file.name);

export default function BulkLabelWizard({
  customerId,
  adminMode,
  onComplete,
}: BulkLabelWizardProps) {
  const [step, setStep] = useState<"add" | "map" | "create">("add");
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [current, setCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);

  const [warehouses, setWarehouses] = useState<
    { id: string; warehouse_name: string; warehouse_code: string }[]
  >([]);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [orderType, setOrderType] = useState("delivery");
  const [dispatchDate, setDispatchDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [batchCategory, setBatchCategory] = useState("");

  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<
    { name: string; ok: boolean; detail: string }[]
  >([]);

  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    supabase
      .from("warehouses")
      .select("id, warehouse_name, warehouse_code")
      .eq("status", "active")
      .then(({ data }) => {
        setWarehouses(data ?? []);
        if (data?.length === 1) setWarehouseId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (!customerId || !warehouseId) return;
    supabase
      .from("inventory_items")
      .select("id, item_code, item_name, quantity, pallet_id")
      .eq("customer_id", customerId)
      .eq("warehouse_id", warehouseId)
      .eq("status", "in_stock")
      .gt("quantity", 0)
      .then(({ data }) => setInventory((data ?? []) as InventoryOption[]));
  }, [customerId, warehouseId]);

  // Object URLs from image previews would leak without this
  useEffect(
    () => () => {
      rows.forEach((row) => {
        if (row.preview?.revoke) URL.revokeObjectURL(row.preview.url);
      });
    },
    [rows]
  );

  // ── files ───────────────────────────────────────────────────────────────
  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const usable = incoming.filter(isLabelFile);
    const rejected = incoming.length - usable.length;

    setRows((prev) => {
      const existing = new Set(prev.map((row) => `${row.file.name}:${row.file.size}`));
      const fresh = usable
        .filter((file) => !existing.has(`${file.name}:${file.size}`))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((file) => ({
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          preview: null,
          previewLoading: true,
          items: [emptyItem()],
          category: "",
        }));

      const duplicates = usable.length - fresh.length;
      if (duplicates > 0) {
        toast.info(`${duplicates} duplicate file(s) skipped`);
      }

      // Render thumbnails in the background as each one finishes
      fresh.forEach(async (row) => {
        const preview = await labelThumbnail(row.file);
        setRows((all) =>
          all.map((item) =>
            item.id === row.id ? { ...item, preview, previewLoading: false } : item
          )
        );
      });

      return [...prev, ...fresh];
    });

    if (rejected > 0) {
      toast.error(`${rejected} file(s) skipped — labels must be PDF, PNG or JPG`);
    }
  };

  const removeRow = (id: string) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      setCurrent((index) => Math.min(index, Math.max(0, next.length - 1)));
      return next;
    });
  };

  // ── stock across the whole batch ────────────────────────────────────────
  const usedQuantity = useMemo(() => batchUsage(rows), [rows]);
  const overdrawn = overdrawnItems(inventory, usedQuantity);

  const remainingFor = (inventoryItemId: string) =>
    remainingStock(inventory, usedQuantity, inventoryItemId);

  // ── per-label editing ───────────────────────────────────────────────────
  const row = rows[current];
  const mappedCount = rows.filter((item) =>
    item.items.some((line) => line.inventory_item_id && line.quantity > 0)
  ).length;

  const patchRow = (id: string, patch: Partial<LabelRow>) =>
    setRows((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );

  const setItem = (index: number, patch: Partial<LabelRow["items"][0]>) => {
    if (!row) return;
    patchRow(row.id, {
      items: row.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    });
  };

  const chooseItem = (index: number, inventoryItemId: string) => {
    const stock = inventory.find((item) => item.id === inventoryItemId);
    setItem(index, {
      inventory_item_id: inventoryItemId,
      item_name: stock?.item_name ?? "",
      pallet_id: stock?.pallet_id ?? null,
    });
  };

  /** Most parcels differ, but consecutive ones often repeat — this is the shortcut. */
  const copyPrevious = () => {
    const previous = rows[current - 1];
    if (!row || !previous) return;
    patchRow(row.id, {
      items: previous.items.map((item) => ({ ...item })),
      category: previous.category,
    });
  };

  const goTo = (index: number) =>
    setCurrent(Math.max(0, Math.min(index, rows.length - 1)));

  // ── create ──────────────────────────────────────────────────────────────
  const unmapped = rows.length - mappedCount;
  const canCreate =
    rows.length > 0 && unmapped === 0 && overdrawn.length === 0 && !!warehouseId;

  const createAll = async () => {
    setCreating(true);
    setStep("create");
    setProgress(0);

    const outcome: typeof results = [];

    for (let index = 0; index < rows.length; index++) {
      const item = rows[index];
      let labelPath: string | null = null;

      try {
        labelPath = await uploadLabel(customerId, item.file);
        const orderNumber = await createOrder({
          customer_id: customerId,
          warehouse_id: warehouseId,
          order_type: orderType,
          requested_date: dispatchDate,
          special_instructions: null,
          order_category: item.category || batchCategory,
          label_path: labelPath,
          pick_and_pack_rate: 0,
          items: item.items
            .filter((line) => line.inventory_item_id)
            .map((line) => ({
              inventory_item_id: line.inventory_item_id,
              quantity: line.quantity,
              unit_price: 0,
              item_name: line.item_name,
              pallet_id: line.pallet_id,
            })),
        });
        outcome.push({ name: item.file.name, ok: true, detail: orderNumber });
      } catch (error) {
        // Don't strand the label file if the order itself failed
        if (labelPath) await removeLabel(labelPath);
        outcome.push({
          name: item.file.name,
          ok: false,
          detail: error instanceof Error ? error.message : "Failed",
        });
      }

      setProgress(Math.round(((index + 1) / rows.length) * 100));
      setResults([...outcome]);
    }

    setCreating(false);

    const failed = outcome.filter((entry) => !entry.ok);
    if (failed.length === 0) {
      toast.success(`${outcome.length} orders created`);
      onComplete();
    } else {
      toast.error(`${failed.length} of ${outcome.length} could not be created`);
      // Keep only the failures so they can be fixed and retried
      setRows((prev) =>
        prev.filter((item) =>
          failed.some((entry) => entry.name === item.file.name)
        )
      );
    }
  };

  // ── step 1: add files ───────────────────────────────────────────────────
  if (step === "add") {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed p-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border"
          )}
        >
          <FileUp className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Drop labels here</p>
            <p className="text-sm text-muted-foreground">
              Or choose files, or a whole folder of them
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <FileUp className="mr-2 h-4 w-4" />
              Select files
            </Button>
            <Button
              variant="outline"
              onClick={() => folderInput.current?.click()}
            >
              <FolderUp className="mr-2 h-4 w-4" />
              Select folder
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            PDF, PNG or JPG · up to 10MB each · one label per order
          </p>

          <input
            ref={fileInput}
            type="file"
            multiple
            accept={LABEL_ACCEPT}
            className="hidden"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            // Non-standard but supported everywhere that matters
            {...({ webkitdirectory: "" } as Record<string, string>)}
            className="hidden"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {rows.length} label{rows.length === 1 ? "" : "s"} ready
              </p>
              <Button variant="ghost" size="sm" onClick={() => setRows([])}>
                Clear all
              </Button>
            </div>

            <div className="grid max-h-72 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
              {rows.map((item) => (
                <div
                  key={item.id}
                  className="group relative rounded-[var(--radius-lg)] border border-border bg-card p-2"
                >
                  <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-muted/40">
                    {item.previewLoading ? (
                      <Spinner />
                    ) : item.preview ? (
                      <img
                        src={item.preview.url}
                        alt={item.file.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <FileUp className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeRow(item.id)}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 shadow transition-opacity group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button disabled={rows.length === 0} onClick={() => setStep("map")}>
            Next: map contents
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ── step 3: creating / results ──────────────────────────────────────────
  if (step === "create") {
    return (
      <div className="space-y-4">
        {creating && (
          <>
            <p className="text-sm font-medium">
              Creating orders… {results.length} of {rows.length}
            </p>
            <Progress value={progress} />
          </>
        )}

        <div className="max-h-80 space-y-1 overflow-y-auto">
          {results.map((result) => (
            <div
              key={result.name}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{result.name}</span>
              <span
                className={cn(
                  "shrink-0 font-medium",
                  result.ok ? "text-green-600" : "text-destructive"
                )}
              >
                {result.ok ? `✓ ${result.detail}` : result.detail}
              </span>
            </div>
          ))}
        </div>

        {!creating && results.some((result) => !result.ok) && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setResults([]);
                setStep("map");
                setCurrent(0);
              }}
            >
              Fix the failures
            </Button>
            <Button variant="outline" onClick={onComplete}>
              Done
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── step 2: map each label ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Batch-wide settings */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Warehouse *</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id}>
                  {warehouse.warehouse_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Dispatch date</Label>
          <Input
            type="date"
            value={dispatchDate}
            onChange={(event) => setDispatchDate(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={orderType} onValueChange={setOrderType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="pickup">Pickup</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Category for all</Label>
          <Input
            placeholder="e.g. T-Shirts"
            value={batchCategory}
            onChange={(event) => setBatchCategory(event.target.value)}
          />
        </div>
      </div>

      {overdrawn.length > 0 && (
        <div className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            {overdrawn.map(({ item, requested }) => (
              <p key={item.id}>
                <span className="font-medium">{item.item_name}</span>: batch
                needs {requested}, only {item.quantity} in stock
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Queue */}
        <div className="flex gap-2 overflow-x-auto pb-2 lg:max-h-[420px] lg:w-24 lg:flex-col lg:overflow-y-auto lg:pb-0">
          {rows.map((item, index) => {
            const done = item.items.some(
              (line) => line.inventory_item_id && line.quantity > 0
            );
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(index)}
                className={cn(
                  "relative shrink-0 rounded-md border-2 p-1 transition-colors",
                  index === current ? "border-primary" : "border-transparent"
                )}
              >
                <div className="flex h-20 w-16 items-center justify-center overflow-hidden rounded bg-muted/40">
                  {item.preview ? (
                    <img
                      src={item.preview.url}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                  )}
                </div>
                {done && (
                  <span className="absolute right-0 top-0 rounded-full bg-green-600 p-0.5 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Current label */}
        {row && (
          <>
            <div className="lg:w-64">
              <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-border bg-muted/30">
                {row.preview ? (
                  <img
                    src={row.preview.url}
                    alt={row.file.name}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    No preview
                  </p>
                )}
              </div>
              <p className="mt-2 truncate text-xs text-muted-foreground" title={row.file.name}>
                {row.file.name}
              </p>
            </div>

            {/* Contents */}
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  Label {current + 1} of {rows.length}
                  <span className="ml-2 text-muted-foreground">
                    · {mappedCount} mapped
                  </span>
                </p>
                <div className="flex gap-2">
                  {current > 0 && (
                    <Button size="sm" variant="outline" onClick={copyPrevious}>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Copy previous
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeRow(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {row.items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_auto]"
                >
                  <ItemSearchInput
                    value={item.inventory_item_id}
                    inventory={inventory}
                    remainingFor={(id) =>
                      remainingFor(id) +
                      (item.inventory_item_id === id ? item.quantity : 0)
                    }
                    onSelect={(id) => chooseItem(index, id)}
                    onCommit={() =>
                      quantityRefs.current[`${row.id}-${index}`]?.focus()
                    }
                    autoFocus={index === 0 && !item.inventory_item_id}
                  />
                  <Input
                    ref={(element) => {
                      quantityRefs.current[`${row.id}-${index}`] = element;
                    }}
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(event) =>
                      setItem(index, { quantity: Number(event.target.value) })
                    }
                    onKeyDown={(event) => {
                      // Enter on the quantity moves straight to the next label
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (current < rows.length - 1) goTo(current + 1);
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={row.items.length === 1}
                    onClick={() =>
                      patchRow(row.id, {
                        items: row.items.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  patchRow(row.id, { items: [...row.items, emptyItem()] })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add item
              </Button>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Category for this label (optional)
                </Label>
                <Input
                  placeholder={batchCategory || "Same as batch"}
                  value={row.category}
                  onChange={(event) =>
                    patchRow(row.id, { category: event.target.value })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={current === 0}
                  onClick={() => goTo(current - 1)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  disabled={current >= rows.length - 1}
                  onClick={() => goTo(current + 1)}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          {unmapped > 0 ? (
            <span className="text-muted-foreground">
              {unmapped} label{unmapped === 1 ? "" : "s"} still need contents
            </span>
          ) : (
            <span className="font-medium text-green-600">
              All {rows.length} labels mapped
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep("add")}>
            Back
          </Button>
          <Button disabled={!canCreate} onClick={createAll}>
            Create {rows.length} order{rows.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      {adminMode && (
        <p className="text-xs text-muted-foreground">
          Orders are created unpriced — set charges on each from the order
          details once they're in.
        </p>
      )}
    </div>
  );
}
