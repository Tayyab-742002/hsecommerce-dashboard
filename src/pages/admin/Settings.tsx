import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import { Building2, Landmark, Receipt } from "lucide-react";

interface CompanySettings {
  company_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  company_number: string | null;
  vat_registered: boolean;
  vat_number: string | null;
  vat_rate: number;
  bank_name: string | null;
  account_name: string | null;
  sort_code: string | null;
  account_number: string | null;
  payment_terms_days: number;
  invoice_footer: string | null;
}

const EMPTY: CompanySettings = {
  company_name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postal_code: "",
  country: "United Kingdom",
  email: "",
  phone: "",
  company_number: "",
  vat_registered: false,
  vat_number: "",
  vat_rate: 0,
  bank_name: "",
  account_name: "",
  sort_code: "",
  account_number: "",
  payment_terms_days: 14,
  invoice_footer: "",
};

export default function AdminSettings() {
  const [settings, setSettings] = useState<CompanySettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("company_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings({ ...EMPTY, ...data });
        setLoading(false);
      });
  }, []);

  const set = <K extends keyof CompanySettings>(
    key: K,
    value: CompanySettings[K]
  ) => setSettings((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!settings.company_name.trim()) {
      toast.error("Company name is required — it heads every invoice");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("company_settings")
      .update({ ...settings })
      .eq("id", 1);

    if (error) {
      toast.error(error.message || "Failed to save settings");
    } else {
      toast.success("Settings saved");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading settings" />
      </div>
    );
  }

  const field = (
    key: keyof CompanySettings,
    label: string,
    props: React.ComponentProps<typeof Input> = {}
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={(settings[key] as string | number) ?? ""}
        onChange={(event) =>
          set(
            key,
            (props.type === "number"
              ? Number(event.target.value)
              : event.target.value) as never
          )
        }
        {...props}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            These details appear on every invoice you issue
          </p>
        </div>
        <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Company details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field("company_name", "Company name *")}
          {field("company_number", "Company number")}
          {field("address_line1", "Address line 1")}
          {field("address_line2", "Address line 2")}
          {field("city", "City")}
          {field("postal_code", "Postcode")}
          {field("country", "Country")}
          {field("email", "Email", { type: "email" })}
          {field("phone", "Phone")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5" />
            Invoicing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border p-3">
            <div className="pr-4">
              <p className="font-medium">VAT registered</p>
              <p className="text-sm text-muted-foreground">
                Off: invoices show a single total with no VAT line. Turn on when
                you register, and new invoices will add VAT.
              </p>
            </div>
            <Switch
              checked={settings.vat_registered}
              onCheckedChange={(checked) => {
                set("vat_registered", checked);
                set("vat_rate", checked ? 20 : 0);
              }}
            />
          </div>

          {settings.vat_registered && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field("vat_number", "VAT number")}
              {field("vat_rate", "VAT rate (%)", {
                type: "number",
                step: "0.01",
              })}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("payment_terms_days", "Payment terms (days)", {
              type: "number",
              min: 0,
            })}
          </div>

          <div className="space-y-2">
            <Label>Invoice footer</Label>
            <Textarea
              rows={3}
              placeholder="Shown in small print at the bottom of every invoice"
              value={settings.invoice_footer ?? ""}
              onChange={(event) => set("invoice_footer", event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Landmark className="h-5 w-5" />
            Payment details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field("bank_name", "Bank name")}
          {field("account_name", "Account name")}
          {field("sort_code", "Sort code")}
          {field("account_number", "Account number")}
        </CardContent>
      </Card>
    </div>
  );
}
