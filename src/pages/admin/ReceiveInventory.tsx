import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PackagePlus } from "lucide-react";

export default function ReceiveInventory() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    customer_id: "",
    warehouse_id: "",
    item_code: "",
    item_name: "",
    description: "",
    category: "",
    quantity: 1,
    weight: "",
    dimension_length: "",
    dimension_width: "",
    dimension_height: "",
    declared_value: "",
    received_date: new Date().toISOString().split('T')[0],
    condition_on_arrival: "good",
    notes: ""
  });

  useEffect(() => {
    fetchCustomers();
    fetchWarehouses();
  }, []);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('id, customer_code, company_name, contact_person')
      .eq('status', 'active');
    setCustomers(data || []);
  };

  const fetchWarehouses = async () => {
    const { data } = await supabase
      .from('warehouses')
      .select('id, warehouse_code, warehouse_name')
      .eq('status', 'active');
    setWarehouses(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase
      .from('inventory_items')
      .insert({
        ...formData,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        dimension_length: formData.dimension_length ? parseFloat(formData.dimension_length) : null,
        dimension_width: formData.dimension_width ? parseFloat(formData.dimension_width) : null,
        dimension_height: formData.dimension_height ? parseFloat(formData.dimension_height) : null,
        declared_value: formData.declared_value ? parseFloat(formData.declared_value) : null,
        status: 'in_stock'
      });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to receive inventory",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Success",
      description: "Inventory received successfully",
    });

    // Reset form
    setFormData({
      customer_id: "",
      warehouse_id: "",
      item_code: "",
      item_name: "",
      description: "",
      category: "",
      quantity: 1,
      weight: "",
      dimension_length: "",
      dimension_width: "",
      dimension_height: "",
      declared_value: "",
      received_date: new Date().toISOString().split('T')[0],
      condition_on_arrival: "good",
      notes: ""
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-lg">
          <PackagePlus className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Receive Inventory</h1>
          <p className="text-muted-foreground">Add new items to warehouse inventory</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Item Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select 
                  value={formData.customer_id} 
                  onValueChange={(value) => setFormData({...formData, customer_id: value})}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.company_name || customer.contact_person} ({customer.customer_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Warehouse *</Label>
                <Select 
                  value={formData.warehouse_id} 
                  onValueChange={(value) => setFormData({...formData, warehouse_id: value})}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map(warehouse => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.warehouse_name} ({warehouse.warehouse_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Item Code *</Label>
                <Input
                  value={formData.item_code}
                  onChange={(e) => setFormData({...formData, item_code: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Item Name *</Label>
                <Input
                  value={formData.item_name}
                  onChange={(e) => setFormData({...formData, item_name: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  placeholder="e.g., electronics, furniture"
                />
              </div>

              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 1})}
                  required
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows={2}
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4">Physical Details</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Weight (kg)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.weight}
                    onChange={(e) => setFormData({...formData, weight: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Length (cm)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.dimension_length}
                    onChange={(e) => setFormData({...formData, dimension_length: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Width (cm)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.dimension_width}
                    onChange={(e) => setFormData({...formData, dimension_width: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Height (cm)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.dimension_height}
                    onChange={(e) => setFormData({...formData, dimension_height: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4">Receipt Details</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Received Date *</Label>
                  <Input
                    type="date"
                    value={formData.received_date}
                    onChange={(e) => setFormData({...formData, received_date: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Condition on Arrival *</Label>
                  <Select 
                    value={formData.condition_on_arrival} 
                    onValueChange={(value) => setFormData({...formData, condition_on_arrival: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="damaged">Damaged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Declared Value (PKR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.declared_value}
                    onChange={(e) => setFormData({...formData, declared_value: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
                placeholder="Any additional notes about this item..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline">Cancel</Button>
              <Button type="submit">Receive Inventory</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
