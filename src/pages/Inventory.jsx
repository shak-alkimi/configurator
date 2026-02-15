import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, RefreshCw, Edit2, Save, X, Search } from "lucide-react";
import { toast } from "sonner";

export default function InventoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const queryClient = useQueryClient();

  // Check if user is admin
  React.useEffect(() => {
    const checkAdmin = async () => {
      const user = await base44.auth.me();
      if (user?.role === 'admin') {
        setIsAdmin(true);
      }
    };
    checkAdmin();
  }, []);

  // Fetch inventory
  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list('-updated_date'),
  });

  // Fetch product catalog for product names
  const { data: products = [] } = useQuery({
    queryKey: ['productCatalog'],
    queryFn: () => base44.entities.ProductCatalog.list(),
  });

  // Update inventory mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Inventory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setEditingId(null);
      toast.success('Inventory updated');
    },
  });

  // Manual sync mutation
  const syncMutation = useMutation({
    mutationFn: () => base44.functions.invoke('manualInventorySync'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Sync initiated');
    },
  });

  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? `${product.product_name} (${product.variant})` : productId;
  };

  const filteredInventory = inventory.filter(item =>
    getProductName(item.product_id).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const lowStockItems = filteredInventory.filter(item => 
    item.quantity_on_hand <= item.reorder_level
  );

  const handleSave = (id) => {
    updateMutation.mutate({
      id,
      data: editValues[id]
    });
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditValues(prev => ({
      ...prev,
      [item.id]: {
        quantity_on_hand: item.quantity_on_hand,
        reorder_level: item.reorder_level,
        warehouse_location: item.warehouse_location
      }
    }));
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500">Inventory management is only available to internal team members.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Inventory Management</h1>
            <p className="text-sm text-slate-500 mt-1">Track stock levels and sync with QuickBooks</p>
          </div>
          <Button
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="gap-2 text-xs h-8 hover:opacity-90"
            style={{ backgroundColor: '#e9ff64', color: '#000' }}
          >
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Manual Sync'}
          </Button>
        </div>

        {/* Low Stock Alert */}
        {lowStockItems.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-orange-900 text-sm">
                  {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} below reorder level
                </div>
                <div className="text-xs text-orange-800 mt-1">
                  {lowStockItems.map(item => getProductName(item.product_id)).join(', ')}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by product name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Inventory Table */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Loading inventory...</div>
        ) : filteredInventory.length === 0 ? (
          <div className="text-center py-12 text-slate-400">No inventory items found</div>
        ) : (
          <div className="grid gap-4">
            {filteredInventory.map((item) => (
              <Card key={item.id} className={lowStockItems.find(i => i.id === item.id) ? 'border-orange-200' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-slate-900">
                        {getProductName(item.product_id)}
                      </div>
                      {item.warehouse_location && (
                        <div className="text-xs text-slate-500 mt-1">
                          Location: {item.warehouse_location}
                        </div>
                      )}
                    </div>

                    {editingId === item.id ? (
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-600">On Hand:</label>
                            <Input
                              type="number"
                              value={editValues[item.id].quantity_on_hand}
                              onChange={(e) => setEditValues(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  quantity_on_hand: parseInt(e.target.value) || 0
                                }
                              }))}
                              className="w-20 h-8 text-sm"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-600">Reorder:</label>
                            <Input
                              type="number"
                              value={editValues[item.id].reorder_level}
                              onChange={(e) => setEditValues(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  reorder_level: parseInt(e.target.value) || 0
                                }
                              }))}
                              className="w-20 h-8 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleSave(item.id)}
                            className="h-8 w-8"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleCancel}
                            className="h-8 w-8"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-slate-900">
                            {item.quantity_on_hand}
                          </div>
                          <div className="text-xs text-slate-500">
                            Reorder at {item.reorder_level}
                          </div>
                        </div>
                        {item.quantity_on_hand <= item.reorder_level && (
                          <Badge className="bg-orange-100 text-orange-800 text-xs">Low Stock</Badge>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEdit(item)}
                          className="h-8 w-8"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}