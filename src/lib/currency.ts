export function formatCurrency(amount: number | string, currency: string = "USD"): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  const safe = Number.isFinite(value) ? (value as number) : 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(safe);
}


