import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Search } from "lucide-react";

interface InventoryItem {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  quantity: number;
  status: string;
  received_date: string;
  warehouses: {
    warehouse_name: string;
  };
}

export default function CustomerInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('customer_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole?.customer_id) return;

    const { data, error } = await supabase
      .from('inventory_items')
      .select(`
        *,
        warehouses (warehouse_name)
      `)
      .eq('customer_id', userRole.customer_id)
      .order('received_date', { ascending: false });

    if (!error && data) {
      setItems(data as InventoryItem[]);
    }
    setLoading(false);
  };

  const filteredItems = items.filter(item =>
    item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.item_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">My Inventory</h1>
        <p className="text-muted-foreground">View your stored items</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Items</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No inventory items found
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Warehouse</th>
                    <th>Quantity</th>
                    <th>Status</th>
                    <th>Received Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td className="font-medium">{item.item_code}</td>
                      <td>{item.item_name}</td>
                      <td className="capitalize">{item.category}</td>
                      <td>{item.warehouses?.warehouse_name}</td>
                      <td>{item.quantity}</td>
                      <td><StatusBadge status={item.status} /></td>
                      <td>{new Date(item.received_date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
