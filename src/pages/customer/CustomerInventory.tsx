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
  sku?: string;
  category?: string;
  quantity: number;
  unit_of_measure?: string;
  weight?: number;
  weight_unit?: string;
  dimension_length?: number;
  dimension_width?: number;
  dimension_height?: number;
  dimension_unit?: string;
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
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {filteredItems.map((item) => (
                  <div key={item.id} className="border border-border rounded-lg bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{item.item_code} — {item.item_name}</div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Warehouse</div>
                      <div className="text-right">{item.warehouses?.warehouse_name}</div>
                      <div className="text-muted-foreground">SKU</div>
                      <div className="text-right">{item.sku || '-'}</div>
                      <div className="text-muted-foreground">Category</div>
                      <div className="text-right capitalize">{item.category || '-'}</div>
                      <div className="text-muted-foreground">Qty</div>
                      <div className="text-right">{item.quantity} {item.unit_of_measure || 'pcs'}</div>
                      <div className="text-muted-foreground">Weight</div>
                      <div className="text-right">{item.weight ? `${item.weight} ${item.weight_unit || 'kg'}` : '-'}</div>
                      <div className="text-muted-foreground">Size</div>
                      <div className="text-right">{item.dimension_length && item.dimension_width && item.dimension_height ? `${item.dimension_length}×${item.dimension_width}×${item.dimension_height} ${item.dimension_unit || 'cm'}` : '-'}</div>
                      <div className="text-muted-foreground">Received</div>
                      <div className="text-right">{new Date(item.received_date).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block w-full overflow-x-auto">
                <div className="table-container min-w-[920px] pr-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item Code</th>
                        <th>Item Name</th>
                        <th>SKU</th>
                        <th>Category</th>
                        <th>Warehouse</th>
                        <th>Quantity</th>
                        <th>UoM</th>
                        <th>Weight</th>
                        <th>Dimensions</th>
                        <th>Status</th>
                        <th>Received Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item) => (
                        <tr key={item.id}>
                          <td className="font-medium whitespace-nowrap">{item.item_code}</td>
                          <td className="whitespace-nowrap">{item.item_name}</td>
                          <td className="whitespace-nowrap">{item.sku || '-'}</td>
                          <td className="capitalize whitespace-nowrap">{item.category || '-'}</td>
                          <td className="whitespace-nowrap">{item.warehouses?.warehouse_name}</td>
                          <td className="whitespace-nowrap">{item.quantity}</td>
                          <td className="whitespace-nowrap">{item.unit_of_measure || 'pcs'}</td>
                          <td className="whitespace-nowrap">{item.weight ? `${item.weight} ${item.weight_unit || 'kg'}` : '-'}</td>
                          <td className="whitespace-nowrap">{item.dimension_length && item.dimension_width && item.dimension_height ? `${item.dimension_length}×${item.dimension_width}×${item.dimension_height} ${item.dimension_unit || 'cm'}` : '-'}</td>
                          <td><StatusBadge status={item.status} /></td>
                          <td className="whitespace-nowrap">{new Date(item.received_date).toLocaleDateString()}</td>
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
    </div>
  );
}
