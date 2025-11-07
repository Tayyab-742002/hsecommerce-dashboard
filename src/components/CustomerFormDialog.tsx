import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

interface Customer {
  id?: string;
  customer_code: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  alternate_phone?: string;
  customer_type: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  status?: string;
  credit_limit?: number;
  payment_terms?: string;
  tax_id?: string;
  notes?: string;
}

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer;
  onSuccess: () => void;
}

const customerSchema = z
  .object({
    customer_code: z.string().min(1, "Customer code is required"),
    company_name: z.string().optional(),
    contact_person: z.string().min(1, "Contact person is required"),
    email: z.string().email("Enter a valid email address"),
    phone: z.string().min(1, "Phone is required"),
    alternate_phone: z.string().optional(),
    customer_type: z.enum(["business", "individual"], {
      required_error: "Customer type is required",
    }),
    address_line1: z.string().optional(),
    address_line2: z.string().optional(),
    city: z.string().optional(),
    country: z.string().min(1, "Country is required"),
    postal_code: z.string().optional(),
    status: z.enum(["active", "inactive", "suspended"]).default("active"),
    notes: z.string().optional(),
    createLogin: z.boolean().optional().default(false),
    password: z.string().optional(),
    userRole: z.enum(["customer_admin", "customer_user"]).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.createLogin) {
      if (!val.password || val.password.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password must be at least 8 characters",
          path: ["password"],
        });
      }
    }
  });

export default function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSuccess,
}: CustomerFormDialogProps) {
  const [formData, setFormData] = useState<Customer>({
    customer_code: "",
    company_name: "",
    contact_person: "",
    email: "",
    phone: "",
    customer_type: "business",
    country: "Pakistan",
    status: "active",
  });
  const [loading, setLoading] = useState(false);
  const [createLogin, setCreateLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [userRole, setUserRole] = useState<"customer_admin" | "customer_user">(
    "customer_user"
  );
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Update formData when customer prop changes
  useEffect(() => {
    if (customer) {
      setFormData({
        customer_code: customer.customer_code || "",
        company_name: customer.company_name || "",
        contact_person: customer.contact_person || "",
        email: customer.email || "",
        phone: customer.phone || "",
        alternate_phone: customer.alternate_phone || "",
        customer_type: customer.customer_type || "business",
        address_line1: customer.address_line1 || "",
        address_line2: customer.address_line2 || "",
        city: customer.city || "",
        country: customer.country || "Pakistan",
        postal_code: customer.postal_code || "",
        status: customer.status || "active",
        notes: customer.notes || "",
      });
      setCreateLogin(false);
      setPassword("");
      setUserRole("customer_user");
      setFormErrors({});
    } else {
      // Reset form when adding new customer
      setFormData({
        customer_code: "",
        company_name: "",
        contact_person: "",
        email: "",
        phone: "",
        customer_type: "business",
        country: "Pakistan",
        status: "active",
      });
      setCreateLogin(false);
      setPassword("");
      setUserRole("customer_user");
      setFormErrors({});
    }
  }, [customer, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validateResult = customerSchema.safeParse({
        ...formData,
        createLogin,
        password,
        userRole,
      });
      if (!validateResult.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of validateResult.error.issues) {
          const path = (issue.path?.[0] as string) || "form";
          if (!fieldErrors[path]) fieldErrors[path] = issue.message;
        }
        setFormErrors(fieldErrors);
        setLoading(false);
        return;
      }
      setFormErrors({});

      // Remove excluded fields from formData before submission
      const { state, credit_limit, payment_terms, tax_id, ...submitData } =
        formData;

      if (customer?.id) {
        const { error } = await supabase
          .from("customers")
          .update(submitData)
          .eq("id", customer.id);

        if (error) throw error;
        toast.success("Customer updated successfully");
      } else {
        // Create customer record
        const { data: newCustomer, error: customerError } = await supabase
          .from("customers")
          .insert(submitData)
          .select()
          .single();

        if (customerError) throw customerError;

        // If admin wants to create login credentials
        if (createLogin && password) {
          // Create auth user
          const { data: authData, error: authError } =
            await supabase.auth.signUp({
              email: formData.email,
              password: password,
              options: {
                emailRedirectTo: `${window.location.origin}/customer/dashboard`,
                data: {
                  first_name: formData.contact_person.split(" ")[0],
                  last_name:
                    formData.contact_person.split(" ").slice(1).join(" ") || "",
                },
              },
            });

          if (authError) throw authError;

          if (authData.user) {
            // Create or update profile if it already exists (avoid duplicate PK errors)
            const { error: profileError } = await supabase
              .from("profiles")
              .upsert(
                {
                  id: authData.user.id,
                  first_name: formData.contact_person.split(" ")[0],
                  last_name:
                    formData.contact_person.split(" ").slice(1).join(" ") || "",
                  email: formData.email,
                  phone: formData.phone,
                  customer_id: newCustomer.id,
                },
                { onConflict: "id" }
              );

            if (profileError) throw profileError;

            // Assign role
            const { error: roleError } = await supabase
              .from("user_roles")
              .insert({
                user_id: authData.user.id,
                role: userRole,
                customer_id: newCustomer.id,
              });

            if (roleError) throw roleError;

            toast.success(
              "Customer and login credentials created successfully"
            );
          }
        } else {
          toast.success("Customer created successfully");
        }
      }

      onSuccess();
      onOpenChange(false);
      // Reset form after successful submission
      if (!customer) {
        setFormData({
          customer_code: "",
          company_name: "",
          contact_person: "",
          email: "",
          phone: "",
          customer_type: "business",
          country: "Pakistan",
          status: "active",
        });
        setCreateLogin(false);
        setPassword("");
        setUserRole("customer_user");
      }
      setFormErrors({});
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "An unexpected error occurred";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {customer ? "Edit Customer" : "Add New Customer"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="customer_code">Customer Code *</Label>
              <Input
                id="customer_code"
                value={formData.customer_code}
                onChange={(e) =>
                  setFormData({ ...formData, customer_code: e.target.value })
                }
                required
                disabled={!!customer}
              />
            </div>
            <div>
              <Label htmlFor="customer_type">Customer Type *</Label>
              <Select
                value={formData.customer_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, customer_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
              {formErrors.customer_type && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.customer_type}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="company_name">Company Name</Label>
            <Input
              id="company_name"
              value={formData.company_name}
              onChange={(e) =>
                setFormData({ ...formData, company_name: e.target.value })
              }
            />
            {formErrors.company_name && (
              <p className="text-sm text-destructive mt-1">
                {formErrors.company_name}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="contact_person">Contact Person *</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) =>
                  setFormData({ ...formData, contact_person: e.target.value })
                }
                required
              />
              {formErrors.contact_person && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.contact_person}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                required
              />
              {formErrors.email && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.email}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                required
              />
              {formErrors.phone && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.phone}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="alternate_phone">Alternate Phone</Label>
              <Input
                id="alternate_phone"
                value={formData.alternate_phone || ""}
                onChange={(e) =>
                  setFormData({ ...formData, alternate_phone: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="address_line1">Address Line 1</Label>
            <Input
              id="address_line1"
              value={formData.address_line1 || ""}
              onChange={(e) =>
                setFormData({ ...formData, address_line1: e.target.value })
              }
            />
          </div>

          <div>
            <Label htmlFor="address_line2">Address Line 2</Label>
            <Input
              id="address_line2"
              value={formData.address_line2 || ""}
              onChange={(e) =>
                setFormData({ ...formData, address_line2: e.target.value })
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city || ""}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="postal_code">Postal Code</Label>
              <Input
                id="postal_code"
                value={formData.postal_code || ""}
                onChange={(e) =>
                  setFormData({ ...formData, postal_code: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formData.country || "Pakistan"}
                onChange={(e) =>
                  setFormData({ ...formData, country: e.target.value })
                }
              />
              {formErrors.country && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.country}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
            />
          </div>

          {!customer && (
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="create_login"
                  checked={createLogin}
                  onCheckedChange={(checked) =>
                    setCreateLogin(checked as boolean)
                  }
                />
                <Label htmlFor="create_login" className="cursor-pointer">
                  Create login credentials for this customer
                </Label>
              </div>

              {createLogin && (
                <>
                  <div>
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Enter temporary password"
                    />
                    {formErrors.password && (
                      <p className="text-sm text-destructive mt-1">
                        {formErrors.password}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="user_role">User Role *</Label>
                    <Select
                      value={userRole}
                      onValueChange={(value) =>
                        setUserRole(value as "customer_admin" | "customer_user")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer_admin">
                          Customer Admin
                        </SelectItem>
                        <SelectItem value="customer_user">
                          Customer User
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : customer ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
