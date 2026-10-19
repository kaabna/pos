'use client';

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ShiftHandoverModalProps {
  storeId: string;
  employeeName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShiftHandoverModal({ storeId, employeeName, isOpen, onClose }: ShiftHandoverModalProps) {
  const [actualCash, setActualCash] = useState('');
  const [actualWallets, setActualWallets] = useState('');
  const [actualBank, setActualBank] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleCloseShift = async () => {
    setLoading(true);
    try {
      const cashVal = parseFloat(actualCash) || 0;
      const walletsVal = parseFloat(actualWallets) || 0;
      const bankVal = parseFloat(actualBank) || 0;

      const supabase = getSupabaseClient();
      const { error } = await supabase.from('shifts').insert([
        {
          store_id: storeId,
          employee_name: employeeName,
          actual_cash: cashVal,
          actual_wallets: walletsVal,
          actual_bank: bankVal,
          status: 'closed',
          end_time: new Date().toISOString(),
          notes: notes,
        },
      ]);

      if (error) throw error;

      const csvContent = `data:text/csv;charset=utf-8,\uFEFF` +
        `تقرير تسليم الشفت - سبيشل موبايل\n` +
        `اسم الموظف,${employeeName}\n` +
        `وقت الإغلاق,${new Date().toLocaleString()}\n\n` +
        `البند,المبلغ الفعلي\n` +
        `الكاش في الدرج,${cashVal}\n` +
        `المحافظ الإلكترونية,${walletsVal}\n` +
        `البنوك,${bankVal}\n` +
        `ملاحظات,${notes || 'لا توجد'}\n`;

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Shift_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert('تم إغلاق الشفت وتصدير Excel بنجاح!');
      onClose();
    } catch (err: any) {
      alert('حدث خطأ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg bg-slate-900 border-slate-700 shadow-xl">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white">تسليم الشفت</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">الكاش الفعلي</label>
            <input type="number" value={actualCash} onChange={(e) => setActualCash(e.target.value)} className="w-full p-2 border border-slate-700 bg-slate-950 text-white rounded" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">رصيد المحافظ</label>
            <input type="number" value={actualWallets} onChange={(e) => setActualWallets(e.target.value)} className="w-full p-2 border border-slate-700 bg-slate-950 text-white rounded" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">البنك</label>
            <input type="number" value={actualBank} onChange={(e) => setActualBank(e.target.value)} className="w-full p-2 border border-slate-700 bg-slate-950 text-white rounded" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">ملاحظات</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-2 border border-slate-700 bg-slate-950 text-white rounded" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="outline" onClick={onClose} className="text-slate-300 border-slate-700 hover:bg-slate-800">إلغاء</Button>
            <Button onClick={handleCloseShift} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">{loading ? 'جاري...' : 'تأكيد وتصدير'}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}