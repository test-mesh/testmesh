'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useReports,
  useGenerateReport,
  useDownloadReport,
  useDeleteReport,
} from '@/lib/hooks/useReports';
import {
  FileText,
  Download,
  Trash2,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Report, ReportFormat } from '@/lib/api/types';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon?: React.ReactNode; label: string }> = {
    completed:  { cls: 'bg-teal-400/10 text-teal-400',   icon: <CheckCircle className="h-3 w-3" />,            label: 'Completed' },
    failed:     { cls: 'bg-red-400/10 text-red-400',     icon: <XCircle className="h-3 w-3" />,                label: 'Failed' },
    generating: { cls: 'bg-blue-400/10 text-blue-400',   icon: <Loader2 className="h-3 w-3 animate-spin" />,   label: 'Generating' },
    pending:    { cls: 'bg-[#1a2d3d] text-[#4a6480]',   icon: <Clock className="h-3 w-3" />,                  label: 'Pending' },
  };
  const entry = map[status] ?? { cls: 'bg-[#1a2d3d] text-[#4a6480]', label: status };
  return (
    <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded w-fit', entry.cls)}>
      {entry.icon}{entry.label}
    </span>
  );
}

function FormatBadge({ fmt }: { fmt: string }) {
  const map: Record<string, string> = {
    html:  'bg-teal-400/10 text-teal-400',
    json:  'bg-emerald-400/10 text-emerald-400',
    junit: 'bg-purple-400/10 text-purple-400',
  };
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded', map[fmt] ?? 'bg-[#1a2d3d] text-[#4a6480]')}>
      {fmt.toUpperCase()}
    </span>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ReportsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    format: 'html' as ReportFormat,
    start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
  });

  const { data, isLoading } = useReports({});
  const generateReport = useGenerateReport();
  const downloadReport = useDownloadReport();
  const deleteReport = useDeleteReport();

  const reports = data?.reports || [];

  const handleGenerate = () => {
    generateReport.mutate(
      {
        name: formData.name || `Report ${format(new Date(), 'yyyy-MM-dd')}`,
        format: formData.format,
        start_date: formData.start_date,
        end_date: formData.end_date,
      },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
          setFormData({
            name: '',
            format: 'html',
            start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end_date: new Date().toISOString().split('T')[0],
          });
        },
      }
    );
  };

  const handleDownload = (report: Report) => {
    const extension = report.format === 'junit' ? 'xml' : report.format;
    downloadReport.mutate({ id: report.id, filename: `${report.name}.${extension}` });
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this report?')) deleteReport.mutate(id);
  };

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8]">Reports</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Generate and download execution reports</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors">
              <Plus className="h-3 w-3" />Generate Report
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate New Report</DialogTitle>
              <DialogDescription>Create a report for a specific date range in your preferred format.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="report-name">Report Name</Label>
                <Input id="report-name" placeholder="e.g., Weekly Test Report"
                  value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={formData.format} onValueChange={(v) => setFormData({ ...formData, format: v as ReportFormat })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="html">HTML (with charts)</SelectItem>
                    <SelectItem value="json">JSON (raw data)</SelectItem>
                    <SelectItem value="junit">JUnit XML (CI/CD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input id="start-date" type="date" value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">End Date</Label>
                  <Input id="end-date" type="date" value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <button onClick={() => setIsDialogOpen(false)}
                className="h-8 px-4 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors">
                Cancel
              </button>
              <button onClick={handleGenerate} disabled={generateReport.isPending}
                className="h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors">
                {generateReport.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin inline" />}
                Generate
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a2332]">
          <span className="text-[11px] font-semibold text-[#c8dce8]">Generated Reports</span>
          <span className="text-[10px] text-[#4a6480]">stored for 7 days after generation</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[#3d5670]" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-10 w-10 mb-3 text-[#1e2d3d]" />
            <p className="text-sm text-[#3d5670] mb-1">No reports yet</p>
            <p className="text-[11px] text-[#2a3d52]">Generate your first report to see it here</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[2fr_auto_1.5fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
              {['Name', 'Format', 'Period', 'Status', 'Size', 'Created', ''].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-[#1a2332]">
              {reports.map((report) => (
                <div key={report.id} className="grid grid-cols-[2fr_auto_1.5fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors">
                  <span className="text-[12px] font-medium text-[#c8dce8] truncate">{report.name}</span>
                  <FormatBadge fmt={report.format} />
                  <span className="text-[11px] text-[#4a6480]">
                    {format(new Date(report.start_date), 'MMM d')} – {format(new Date(report.end_date), 'MMM d, yyyy')}
                  </span>
                  <StatusBadge status={report.status} />
                  <span className="text-[11px] text-[#4a6480]">
                    {report.file_size > 0 ? formatFileSize(report.file_size) : '—'}
                  </span>
                  <span className="text-[11px] text-[#4a6480]">
                    {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={report.status !== 'completed'}
                      onClick={() => handleDownload(report)}
                      className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-teal-400 hover:bg-teal-400/10 disabled:opacity-30 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(report.id)}
                      className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
