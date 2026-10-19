'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
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

  // دالة إغلاق الشفت وحساب الفروقات وتصدير تقرير Excel
  const handleCloseShift = async () => {
    setLoading(true);
    try {
      const cashVal = parseFloat(actualCash) || 0;
      const walletsVal = parseFloat(actualWallets) || 0;
      const bankVal = parseFloat(actualBank) || 0;

      // 1. حفظ بيانات الشفت في قاعدة البيانات
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

      // 2. توليد وتحميل تقرير Excel (CSV يدعم اللغة العربية)
      const csvContent = `data:text/csv;charset=utf-8,\uFEFF` +
        `تقرير تسليم الشفت - سبيشل موبايل\n` +
        `اسم الموظف,${employeeName}\n` +
        `وقت الإغلاق,${new Date().toLocaleString()}\n\n` +
        `البند,المبلغ الفعلي (الواقع)\n` +
        `الكاش في الدرج,${cashVal} دينار\n` +
        `المحافظ الإلكترونية (زين/أورانج),${walletsVal} دينار\n` +
        `الحسابات البنكية,${bankVal} دينار\n` +
        `ملاحظات الشفت,${notes || 'لا توجد ملاحظات'}\n`;

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Shift_Report_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert('تم إغلاق الشفت بنجاح وتصدير تقرير الـ Excel!');
      onClose();
    } catch (err: any) {
      alert('حدث خطأ أثناء إغلاق الشفت: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg bg-white shadow-xl">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-gray-800">تسليم وإغلاق الشفت (الجرد المالي)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الكاش الفعلي في الدرج (دينار)</label>
            <input
              type="number"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              placeholder="0.00"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">رصيد المحافظ الإلكترونية (زين كاش / أورانج)</label>
            <input
              type="number"
              value={actualWallets}
              onChange={(e) => setActualWallets(e.target.value)}
              placeholder="0.00"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">أرصدة البنوك والحوالات</label>
            <input
              type="number"
              value={actualBank}
              onChange={(e) => setActualBank(e.target.value)}
              placeholder="0.00"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات تسليم الشفت (عجز، زيادة، أو تسليم لفلان)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اكتب أي ملاحظات مالية أو بضاعة معلقة..."
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={handleCloseShift} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
              {loading ? 'جاري الإغلاق...' : 'تأكيد إغلاق الشفت وتصدير Excel'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}