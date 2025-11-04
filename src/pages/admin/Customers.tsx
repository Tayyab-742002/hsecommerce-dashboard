import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Users, Plus, Pencil, Trash2, Eye } from "lucide-react";
import CustomerFormDialog from "@/components/CustomerFormDialog";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { formatCurrency } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Customer {
  id: string;
  customer_code: string;
  customer_type: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  status: string;
  credit_limit?: number;
  payment_terms?: string;
  tax_id?: string;
  city: string;
  country: string;
  address_line1?: string;
  created_at: string;
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<
    Customer | undefined
  >();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setCustomers(data);
    }
    setLoading(false);
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.customer_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.contact_person
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedCustomer(undefined);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!customerToDelete) return;

    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", customerToDelete);

      if (error) throw error;
      toast.success("Customer deleted successfully");
      fetchCustomers();
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to delete customer";
      toast.error(message);
    } finally {
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    }
  };

  const handleViewInventory = (customerId: string) => {
    navigate(`/admin/inventory?customer=${customerId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-lg">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Customers</h1>
            <p className="text-muted-foreground">Manage customer accounts</p>
          </div>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Customer
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Customers</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 focus:border-none"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner label="Loading customers" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No customers found
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="border border-border rounded-[var(--radius-lg)] bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        {customer.customer_code} — {customer.company_name}
                      </div>
                      <StatusBadge status={customer.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                      <div className="text-muted-foreground text-xs">
                        Contact
                      </div>
                      <div className="text-right">
                        {customer.contact_person}
                      </div>
                      <div className="text-muted-foreground text-xs">Email</div>
                      <div className="text-right">{customer.email}</div>
                      <div className="text-muted-foreground text-xs">Phone</div>
                      <div className="text-right">{customer.phone}</div>
                      <div className="text-muted-foreground text-xs">Type</div>
                      <div className="text-right capitalize">
                        {customer.customer_type}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Address
                      </div>
                      <div className="text-right">
                        {customer.address_line1 || "-"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Location
                      </div>
                      <div className="text-right">
                        {customer.city}, {customer.country}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Credit Limit
                      </div>
                      <div className="text-right">
                        {typeof customer.credit_limit === "number"
                          ? formatCurrency(customer.credit_limit)
                          : "-"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Payment
                      </div>
                      <div className="text-right">
                        {customer.payment_terms || "-"}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewInventory(customer.id)}
                      >
                        <Eye className="h-4 w-4 mr-1" /> Inventory
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(customer)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setCustomerToDelete(customer.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block w-full overflow-x-auto">
                <div className="table-container min-w-[1100px] pr-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Customer Code</th>
                        <th>Company Name</th>
                        <th>Contact Person</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Type</th>
                        <th>Address</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Credit Limit</th>
                        <th>Payment Terms</th>
                        <th>Tax ID</th>
                        <th>Joined</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((customer) => (
                        <tr key={customer.id}>
                          <td className="font-medium whitespace-nowrap">
                            {customer.customer_code}
                          </td>
                          <td className="whitespace-nowrap">
                            {customer.company_name}
                          </td>
                          <td className="whitespace-nowrap">
                            {customer.contact_person}
                          </td>
                          <td className="whitespace-nowrap">
                            {customer.email}
                          </td>
                          <td className="whitespace-nowrap">
                            {customer.phone}
                          </td>
                          <td className="capitalize whitespace-nowrap">
                            {customer.customer_type}
                          </td>
                          <td className="whitespace-nowrap">
                            {customer.address_line1 || "-"}
                          </td>
                          <td className="whitespace-nowrap">
                            {customer.city}, {customer.country}
                          </td>
                          <td>
                            <StatusBadge status={customer.status} />
                          </td>
                          <td className="whitespace-nowrap">
                            {typeof customer.credit_limit === "number"
                              ? formatCurrency(customer.credit_limit)
                              : "-"}
                          </td>
                          <td className="whitespace-nowrap">
                            {customer.payment_terms || "-"}
                          </td>
                          <td className="whitespace-nowrap">
                            {customer.tax_id || "-"}
                          </td>
                          <td className="whitespace-nowrap">
                            {new Date(customer.created_at).toLocaleDateString()}
                          </td>
                          <td>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewInventory(customer.id)}
                              >
                                <Eye className="h-4 w-4 mr-1" /> Inventory
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(customer)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setCustomerToDelete(customer.id);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={selectedCustomer}
        onSuccess={fetchCustomers}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this customer and all associated
              data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
