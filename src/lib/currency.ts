export function formatCurrency(amount: number | string, currency: string = "GBP"): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  const safe = Number.isFinite(value) ? (value as number) : 0;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(safe);
}


