'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CategoryManagerProps {
  storeId: string;
  onCategoryAdded?: () => void;
}

export function CategoryManager({ storeId, onCategoryAdded }: CategoryManagerProps) {
  const [categories, setCategories] = useState<any[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(false);

  // جلب التصنيفات الخاصة بالمتجر
  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('store_id', storeId);
    
    if (!error && data) {
      setCategories(data);
    }
  };

  useEffect(() => {
    if (storeId) fetchCategories();
  }, [storeId]);

  // إضافة تصنيف جديد
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setLoading(true);
    const { error } = await supabase.from('categories').insert([
      {
        store_id: storeId,
        name: newCategoryName.trim(),
        slug: newCategoryName.trim().toLowerCase().replace(/\s+/g, '-'),
      },
    ]);

    if (error) {
      alert('خطأ أثناء إضافة التصنيف: ' + error.message);
    } else {
      setNewCategoryName('');
      fetchCategories();
      if (onCategoryAdded) onCategoryAdded();
    }
    setLoading(false);
  };

  return (
    <Card className="bg-white shadow-md mb-6">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-gray-800">إدارة تصنيفات البضائع (ديناميكية بلا حدود)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* نموذج إضافة تصنيف */}
        <form onSubmit={handleAddCategory} className="flex gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="اسم التصنيف الجديد (مثل: كفرات حماية، شواحن أصلية...)"
            className="flex-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
            {loading ? 'جاري الإضافة...' : 'إضافة تصنيف'}
          </Button>
        </form>

        {/* عرض التصنيفات الحالية */}
        <div className="flex flex-wrap gap-2 pt-2">
          {categories.length === 0 ? (
            <p className="text-sm text-gray-500">لا توجد تصنيفات مضافة حتى الآن. أضف أول تصنيف بالأعلى!</p>
          ) : (
            categories.map((cat) => (
              <span
                key={cat.id}
                className="bg-gray-100 text-gray-800 text-sm font-medium px-3 py-1.5 rounded-full border flex items-center gap-2"
              >
                📦 {cat.name}
              </span>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
