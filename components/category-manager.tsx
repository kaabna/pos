'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
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

  const fetchCategories = async () => {
    const supabase = getSupabaseClient();
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

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setLoading(true);
    const supabase = getSupabaseClient();
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
    <Card className="bg-slate-900 border-slate-700 shadow-md mb-6">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-white">إدارة تصنيفات البضائع (ديناميكية)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAddCategory} className="flex gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="اسم التصنيف الجديد (مثل: كفرات حماية...)"
            className="flex-1 p-2 border border-slate-700 bg-slate-950 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
          />
          <Button type="submit" disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 text-white">
            {loading ? 'جاري الإضافة...' : 'إضافة تصنيف'}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2 pt-2">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد تصنيفات مضافة. أضف أول تصنيف بالأعلى!</p>
          ) : (
            categories.map((cat) => (
              <span
                key={cat.id}
                className="bg-slate-800 text-cyan-300 text-sm font-medium px-3 py-1.5 rounded-full border border-slate-700 flex items-center gap-2"
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